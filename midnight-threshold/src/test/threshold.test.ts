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
import { buildProviders, type ThresholdProviders } from '../providers.js';
import {
  CompiledThresholdContract,
  Contract,
  ledger,
  zkConfigPath,
  createThresholdPrivateState,
} from '../../contracts/index.js';

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
const PRIVATE_STATE_ID = 'AliceThresholdPrivateState';

// VAL-002 scope: the original brief asks for a threshold of 500 and a
// secret of 800 (passes) plus a secret of 300 (fails). These constants
// preserve that scenario against the real contract.
const INITIAL_THRESHOLD = 500n;
const SCORE_ABOVE = 800n;
const SCORE_BELOW = 300n;

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

describe(`Proof-of-Threshold Contract (${network})`, () => {
  let wallet: MidnightWalletProvider;
  let providers: ThresholdProviders;
  let contractAddress: ContractAddress;

  const config = getConfig();
  const secret = resolveSecret(network);
  const isRemote = config.faucet !== '';
  const syncTimeoutMs = Number(
    process.env['MIDNIGHT_SYNC_TIMEOUT_MS'] ??
      (isRemote ? 60 * 60_000 : 10 * 60_000),
  );

  async function queryLedger(p: ThresholdProviders) {
    const state = await p.publicDataProvider.queryContractState(contractAddress);
    expect(state).not.toBeNull();
    return ledger(state!.data);
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

    providers = buildProviders(wallet, zkConfigPath, config);
    logger.info(`Providers initialized on '${network}'. Ready to test!`);
  });

  afterAll(async () => {
    if (wallet) {
      logger.info('Stopping wallet...');
      await wallet.stop();
    }
  });

  it('Deploys the contract with threshold = 500', async () => {
    logger.info('Creating private state (score not yet set for deploy)...');

    // The witness is only invoked when proveThreshold() runs, so the
    // private state at deploy time holds a placeholder score. It is
    // overwritten per-prover before each proveThreshold() call below.
    const deployed: DeployedContract<Contract> =
      await (deployContract<Contract>)(providers, {
        compiledContract: CompiledThresholdContract,
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: createThresholdPrivateState(0n),
        args: [INITIAL_THRESHOLD],
      });

    logger.info('Setting the contract address...');
    contractAddress = deployed.deployTxData.public.contractAddress;
    logger.info(`Contract deployed at: ${contractAddress}`);
    expect(contractAddress).toBeDefined();
    expect(contractAddress.length).toBeGreaterThan(0);

    const state = await queryLedger(providers);
    expect(state.threshold).toEqual(INITIAL_THRESHOLD);
    expect(state.lastResult).toEqual(false);
  });

  it(`Proves score=${SCORE_ABOVE} clears threshold=${INITIAL_THRESHOLD} (expects true)`, async () => {
    providers.privateStateProvider.setContractAddress(contractAddress);
    await providers.privateStateProvider.set(
      PRIVATE_STATE_ID,
      createThresholdPrivateState(SCORE_ABOVE),
    );

    await (submitCallTx<Contract, 'proveThreshold'>)(providers, {
      compiledContract: CompiledThresholdContract,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId: 'proveThreshold',
      args: [],
    });

    const state = await queryLedger(providers);
    logger.info(
      `Proof submitted for an above-threshold secret. Public result: lastResult=${state.lastResult}`,
    );
    expect(state.lastResult).toEqual(true);
  });

  it(`Proves score=${SCORE_BELOW} fails threshold=${INITIAL_THRESHOLD} (expects false)`, async () => {
    providers.privateStateProvider.setContractAddress(contractAddress);
    await providers.privateStateProvider.set(
      PRIVATE_STATE_ID,
      createThresholdPrivateState(SCORE_BELOW),
    );

    await (submitCallTx<Contract, 'proveThreshold'>)(providers, {
      compiledContract: CompiledThresholdContract,
      contractAddress,
      privateStateId: PRIVATE_STATE_ID,
      circuitId: 'proveThreshold',
      args: [],
    });

    const state = await queryLedger(providers);
    logger.info(
      `Proof submitted for a below-threshold secret. Public result: lastResult=${state.lastResult}`,
    );
    expect(state.lastResult).toEqual(false);
  });
});