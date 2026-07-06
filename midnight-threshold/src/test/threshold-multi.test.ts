import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  deployContract,
  submitCallTx,
  type DeployedContract,
} from '@midnight-ntwrk/midnight-js-contracts';
import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { type EnvironmentConfiguration, waitForFunds } from '@midnight-ntwrk/testkit-js';
import pino from 'pino';

import { getConfig } from '../config.js';
import {
  MidnightWalletProvider,
  syncWallet,
  type WalletSecret,
} from '../wallet.js';
import { buildMultiProviders, type MultiThresholdProviders } from '../providers-multi.js';
import {
  CompiledMultiThresholdContract,
  MultiContract,
  multiLedger,
  multiZkConfigPath,
  Tier,
} from '../../contracts/index-multi.js';
import { createThresholdPrivateState } from '../../contracts/witnesses.js';

// Required for GraphQL subscriptions in Node.js
// @ts-expect-error WebSocket global assignment for apollo
globalThis.WebSocket = WebSocket;

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
  console.error('Promise:', promise);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

const ALICE_LOCAL_SEED =
  '0000000000000000000000000000000000000000000000000000000000000001';
const PRIVATE_STATE_ID = 'AliceMultiThresholdPrivateState';

// Two-tier scenario per VAL-002 extension scope: LOW=500, HIGH=800.
const INITIAL_LOW = 500n;
const INITIAL_HIGH = 800n;

// Scores chosen to exercise all four combinations of tier x outcome:
const SCORE_CLEARS_BOTH = 900n;   // >= 500 and >= 800
const SCORE_CLEARS_LOW_ONLY = 650n; // >= 500 but < 800
const SCORE_CLEARS_NEITHER = 200n;  // < 500 and < 800

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: { target: 'pino-pretty' },
});

const network = process.env['MIDNIGHT_NETWORK'] ?? 'local';

function resolveSecret(net: string): WalletSecret {
  if (net === 'local') return { kind: 'seed', value: ALICE_LOCAL_SEED };

  const upper = net.toUpperCase();
  const mnemonicEnv = `MIDNIGHT_${upper}_MNEMONIC`;
  const seedEnv = `MIDNIGHT_${upper}_SEED`;
  const mnemonic = process.env[mnemonicEnv]?.trim().replace(/\s+/g, ' ');
  const seedHex = process.env[seedEnv]?.trim();

  if (mnemonic && seedHex) {
    throw new Error(
      `Set only one of ${mnemonicEnv} or ${seedEnv} (both are defined).`,
    );
  }
  if (mnemonic) {
    return { kind: 'mnemonic', value: mnemonic };
  }
  if (seedHex) {
    if (!/^[0-9a-fA-F]+$/.test(seedHex) || seedHex.length % 2 !== 0) {
      throw new Error(
        `${seedEnv} must be a hex string of even length (no 0x prefix).`,
      );
    }
    return { kind: 'seed', value: seedHex };
  }
  throw new Error(
    `Either ${mnemonicEnv} or ${seedEnv} is required for network '${net}'. ` +
      `Set one in .env.${net} or the shell.`,
  );
}

describe(`Multi-Tier Proof-of-Threshold Contract (${network})`, () => {
  let wallet: MidnightWalletProvider;
  let providers: MultiThresholdProviders;
  let contractAddress: ContractAddress;

  const config = getConfig();
  const secret = resolveSecret(network);
  const isRemote = config.faucet !== '';
  const syncTimeoutMs = Number(
    process.env['MIDNIGHT_SYNC_TIMEOUT_MS'] ??
      (isRemote ? 60 * 60_000 : 10 * 60_000),
  );

  async function queryLedger(p: MultiThresholdProviders) {
    const state = await p.publicDataProvider.queryContractState(contractAddress);
    expect(state).not.toBeNull();
    return multiLedger(state!.data);
  }

  async function proveAs(tier: Tier, score: bigint) {
    providers.privateStateProvider.setContractAddress(contractAddress);
    await providers.privateStateProvider.set(
      PRIVATE_STATE_ID,
      createThresholdPrivateState(score),
    );

    await (submitCallTx<MultiContract, 'proveThreshold'>)(providers, {
      compiledContract: CompiledMultiThresholdContract,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId: 'proveThreshold',
      args: [tier],
    });

    return queryLedger(providers);
  }

  beforeAll(async () => {
    setNetworkId(config.networkId);

    const envConfig: EnvironmentConfiguration = {
      walletNetworkId: config.networkId,
      networkId: config.networkId,
      indexer: config.indexer,
      indexerWS: config.indexerWS,
      node: config.node,
      nodeWS: config.nodeWS,
      faucet: config.faucet,
      proofServer: config.proofServer,
    };

    wallet = await MidnightWalletProvider.build(logger, envConfig, secret);
    await wallet.start();

    if (isRemote) {
      // testkit-js's own internal syncWallet (used inside waitForFunds)
      // has a hardcoded 90-second default timeout per call, which is far
      // too short for a fresh wallet's first sync against Preprod's real
      // chain depth (observed: 1000+ emissions, several minutes). We
      // cannot pass a longer timeout into waitForFunds directly - it has
      // no such parameter - so we pre-sync the wallet ourselves with a
      // generous timeout first. By the time waitForFunds makes its own
      // internal syncWallet calls, the wallet's local state is already
      // current, so those calls resolve almost immediately instead of
      // needing the full slow sync from scratch.
      logger.info('Pre-syncing wallet with extended timeout before waitForFunds...');
      await syncWallet(logger, wallet.wallet, syncTimeoutMs);

      // On a remote network, dust=true can never be reached until the
      // wallet has been explicitly registered for DUST generation.
      // waitForFunds handles the faucet drip (if needed) and the
      // registration transaction itself.
      const nightBalance = await waitForFunds(
        wallet.wallet,
        envConfig,
        true,
        wallet.unshieldedKeystore,
      );
      logger.info(`Wallet NIGHT balance on '${network}': ${nightBalance}`);
    }

    await syncWallet(logger, wallet.wallet, syncTimeoutMs);

    providers = buildMultiProviders(wallet, multiZkConfigPath, config);
    logger.info(`Multi-threshold providers initialized on '${network}'. Ready to test!`);
  });

  afterAll(async () => {
    if (wallet) {
      logger.info('Stopping wallet...');
      await wallet.stop();
    }
  });

  it(`Deploys with thresholdLow=${INITIAL_LOW}, thresholdHigh=${INITIAL_HIGH}`, async () => {
    let deployed: DeployedContract<MultiContract>;
    try {
      deployed = await (deployContract<MultiContract>)(providers, {
        compiledContract: CompiledMultiThresholdContract,
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: createThresholdPrivateState(0n),
        args: [INITIAL_LOW, INITIAL_HIGH],
      });
    } catch (err) {
      // TEMPORARY DIAGNOSTIC: walk the full err.cause chain to find the
      // real underlying error hidden behind the SDK's generic
      // "Transaction submission error" wrapper.
      let level = 0;
      let current: unknown = err;
      while (current) {
        const tag = (current as { _tag?: string })._tag;
        const message =
          current instanceof Error
            ? current.message
            : (current as { message?: string })?.message;
        logger.error(
          `[cause chain ${level}] ${tag ? `_tag=${tag} ` : ''}message=${message}`,
        );
        current =
          current instanceof Error
            ? current.cause
            : (current as { cause?: unknown })?.cause;
        level += 1;
      }
      throw err;
    }

    contractAddress = deployed.deployTxData.public.contractAddress;
    logger.info(`Multi-threshold contract deployed at: ${contractAddress}`);
    expect(contractAddress).toBeDefined();

    const state = await queryLedger(providers);
    expect(state.thresholdLow).toEqual(INITIAL_LOW);
    expect(state.thresholdHigh).toEqual(INITIAL_HIGH);
    expect(state.lastResult).toEqual(false);
  });

  it(`score=${SCORE_CLEARS_BOTH} clears LOW tier (expects true)`, async () => {
    const state = await proveAs(Tier.LOW, SCORE_CLEARS_BOTH);
    logger.info(`tier=LOW score=${SCORE_CLEARS_BOTH} -> lastResult=${state.lastResult}`);
    expect(state.lastTier).toEqual(Tier.LOW);
    expect(state.lastResult).toEqual(true);
  });

  it(`score=${SCORE_CLEARS_BOTH} clears HIGH tier (expects true)`, async () => {
    const state = await proveAs(Tier.HIGH, SCORE_CLEARS_BOTH);
    logger.info(`tier=HIGH score=${SCORE_CLEARS_BOTH} -> lastResult=${state.lastResult}`);
    expect(state.lastTier).toEqual(Tier.HIGH);
    expect(state.lastResult).toEqual(true);
  });

  it(`score=${SCORE_CLEARS_LOW_ONLY} clears LOW tier (expects true)`, async () => {
    const state = await proveAs(Tier.LOW, SCORE_CLEARS_LOW_ONLY);
    logger.info(`tier=LOW score=${SCORE_CLEARS_LOW_ONLY} -> lastResult=${state.lastResult}`);
    expect(state.lastTier).toEqual(Tier.LOW);
    expect(state.lastResult).toEqual(true);
  });

  it(`score=${SCORE_CLEARS_LOW_ONLY} fails HIGH tier (expects false)`, async () => {
    const state = await proveAs(Tier.HIGH, SCORE_CLEARS_LOW_ONLY);
    logger.info(`tier=HIGH score=${SCORE_CLEARS_LOW_ONLY} -> lastResult=${state.lastResult}`);
    expect(state.lastTier).toEqual(Tier.HIGH);
    expect(state.lastResult).toEqual(false);
  });

  it(`score=${SCORE_CLEARS_NEITHER} fails LOW tier (expects false)`, async () => {
    const state = await proveAs(Tier.LOW, SCORE_CLEARS_NEITHER);
    logger.info(`tier=LOW score=${SCORE_CLEARS_NEITHER} -> lastResult=${state.lastResult}`);
    expect(state.lastTier).toEqual(Tier.LOW);
    expect(state.lastResult).toEqual(false);
  });

  it(`score=${SCORE_CLEARS_NEITHER} fails HIGH tier (expects false)`, async () => {
    const state = await proveAs(Tier.HIGH, SCORE_CLEARS_NEITHER);
    logger.info(`tier=HIGH score=${SCORE_CLEARS_NEITHER} -> lastResult=${state.lastResult}`);
    expect(state.lastTier).toEqual(Tier.HIGH);
    expect(state.lastResult).toEqual(false);
  });
});