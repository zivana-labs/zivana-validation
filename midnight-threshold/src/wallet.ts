import {
  type CoinPublicKey,
  DustSecretKey,
  type EncPublicKey,
  type FinalizedTransaction,
  LedgerParameters,
  ZswapSecretKeys,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import {
  type MidnightProvider,
  type UnboundTransaction,
  type WalletProvider,
} from '@midnight-ntwrk/midnight-js-types';
import { ttlOneHour } from '@midnight-ntwrk/midnight-js-utils';
import { type WalletFacade, type FacadeState } from '@midnight-ntwrk/wallet-sdk-facade';
import {
  type DustWalletOptions,
  type EnvironmentConfiguration,
  FluentWalletBuilder,
} from '@midnight-ntwrk/testkit-js';
import type { UnshieldedKeystore } from '@midnight-ntwrk/wallet-sdk';
import * as Rx from 'rxjs';
import type { Logger } from 'pino';

export type WalletSecret =
  | { kind: 'seed'; value: string }
  | { kind: 'mnemonic'; value: string };

export class MidnightWalletProvider implements MidnightProvider, WalletProvider {
  readonly wallet: WalletFacade;
  readonly unshieldedKeystore: UnshieldedKeystore;

  private constructor(
    private readonly logger: Logger,
    wallet: WalletFacade,
    private readonly zswapSecretKeys: ZswapSecretKeys,
    private readonly dustSecretKey: DustSecretKey,
    unshieldedKeystore: UnshieldedKeystore,
  ) {
    this.wallet = wallet;
    this.unshieldedKeystore = unshieldedKeystore;
  }

  getCoinPublicKey(): CoinPublicKey {
    return this.zswapSecretKeys.coinPublicKey;
  }

  getEncryptionPublicKey(): EncPublicKey {
    return this.zswapSecretKeys.encryptionPublicKey;
  }

  async balanceTx(
    tx: UnboundTransaction,
    ttl: Date = ttlOneHour(),
  ): Promise<FinalizedTransaction> {
    const recipe = await this.wallet.balanceUnboundTransaction(
      tx,
      {
        shieldedSecretKeys: this.zswapSecretKeys,
        dustSecretKey: this.dustSecretKey,
      },
      { ttl },
    );
    return await this.wallet.finalizeRecipe(recipe);
  }

  submitTx(tx: FinalizedTransaction): Promise<string> {
    return this.wallet.submitTransaction(tx);
  }

  async start(): Promise<void> {
    this.logger.info('Starting wallet...');
    await this.wallet.start(this.zswapSecretKeys, this.dustSecretKey);
  }

  async stop(): Promise<void> {
    return this.wallet.stop();
  }

  static async build(
    logger: Logger,
    env: EnvironmentConfiguration,
    secret: WalletSecret,
  ): Promise<MidnightWalletProvider> {
    const dustOptions: DustWalletOptions = {
      ledgerParams: LedgerParameters.initialParameters(),
      additionalFeeOverhead: 1_000n,
      feeBlocksMargin: 5,
    };

    const base = FluentWalletBuilder.forEnvironment(env)
      .withDustOptions(dustOptions);
    const builder =
      secret.kind === 'mnemonic'
        ? base.withMnemonic(secret.value)
        : base.withSeed(secret.value);

    const buildResult = await builder.buildWithoutStarting();
    const { wallet, seeds, keystore } = buildResult as {
      wallet: WalletFacade;
      seeds: {
        masterSeed: string;
        shielded: Uint8Array;
        dust: Uint8Array;
      };
      keystore: UnshieldedKeystore;
    };

    logger.info(
      `Wallet built from ${secret.kind}; master seed: ${seeds.masterSeed.slice(0, 8)}...`,
    );

    return new MidnightWalletProvider(
      logger,
      wallet,
      ZswapSecretKeys.fromSeed(seeds.shielded),
      DustSecretKey.fromSeed(seeds.dust),
      keystore,
    );
  }
}

function isProgressStrictlyComplete(progress: unknown): boolean {
  if (!progress || typeof progress !== 'object') {
    return false;
  }
  const candidate = progress as { isStrictlyComplete?: unknown };
  if (typeof candidate.isStrictlyComplete !== 'function') {
    return false;
  }
  return (candidate.isStrictlyComplete as () => boolean)();
}

// Shape of SyncProgress for shielded/dust (wallet-sdk-abstractions/SyncProgress.d.ts):
// indices into the Zswap/dust commitment stream, not transaction counts.
type IndexProgress = {
  appliedIndex: bigint;
  highestIndex: bigint;
  highestRelevantIndex: bigint;
  isConnected: boolean;
};

// Shape of SyncProgress for unshielded (wallet-sdk-unshielded-wallet/v1/SyncProgress.d.ts):
// keyed by transaction id rather than commitment index.
type TxIdProgress = {
  appliedId: bigint;
  highestTransactionId: bigint;
  isConnected: boolean;
};

function formatIndexProgressDelta(
  label: string,
  current: IndexProgress,
  previous: IndexProgress | undefined,
): string {
  const gap = current.highestIndex - current.appliedIndex;
  const delta = previous === undefined ? 'n/a' : (current.appliedIndex - previous.appliedIndex).toString();
  return `${label}: appliedIndex=${current.appliedIndex}/${current.highestIndex} (gap=${gap}, Δ=${delta}), relevantIndex=${current.highestRelevantIndex}, connected=${current.isConnected}`;
}

function formatTxIdProgressDelta(current: TxIdProgress, previous: TxIdProgress | undefined): string {
  const gap = current.highestTransactionId - current.appliedId;
  const delta = previous === undefined ? 'n/a' : (current.appliedId - previous.appliedId).toString();
  return `unshielded: appliedId=${current.appliedId}/${current.highestTransactionId} (gap=${gap}, Δ=${delta}), connected=${current.isConnected}`;
}

export async function syncWallet(
  logger: Logger,
  wallet: WalletFacade,
  timeout = 300_000,
): Promise<FacadeState> {
  logger.info('Syncing wallet...');
  let emissionCount = 0;
  let prevShielded: IndexProgress | undefined;
  let prevUnshielded: TxIdProgress | undefined;
  let prevDust: IndexProgress | undefined;
  return Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.tap((state: FacadeState) => {
        emissionCount++;
        const shieldedProgress = state.shielded.state.progress as IndexProgress;
        const unshieldedProgress = state.unshielded.progress as TxIdProgress;
        const dustProgress = state.dust.state.progress as IndexProgress;
        const shielded = isProgressStrictlyComplete(shieldedProgress);
        const unshielded = isProgressStrictlyComplete(unshieldedProgress);
        const dust = isProgressStrictlyComplete(dustProgress);
        logger.info(
          `Wallet sync [${emissionCount}]: shielded=${shielded}, unshielded=${unshielded}, dust=${dust}`,
        );
        if (!shielded) {
          logger.info(`  ${formatIndexProgressDelta('shielded', shieldedProgress, prevShielded)}`);
        }
        if (!unshielded) {
          logger.info(`  ${formatTxIdProgressDelta(unshieldedProgress, prevUnshielded)}`);
        }
        if (!dust) {
          logger.info(`  ${formatIndexProgressDelta('dust', dustProgress, prevDust)}`);
        }
        prevShielded = shieldedProgress;
        prevUnshielded = unshieldedProgress;
        prevDust = dustProgress;
      }),
      Rx.filter(
        (state: FacadeState) =>
          isProgressStrictlyComplete(state.shielded.state.progress) &&
          isProgressStrictlyComplete(state.dust.state.progress) &&
          isProgressStrictlyComplete(state.unshielded.progress),
      ),
      Rx.tap(() => logger.info(`Wallet sync complete after ${emissionCount} emissions`)),
      Rx.timeout({
        each: timeout,
        with: () =>
          Rx.throwError(
            () => new Error(`Wallet sync timeout after ${timeout}ms (${emissionCount} emissions received)`),
          ),
      }),
      Rx.catchError((err) => {
        logger.error(`Wallet sync error: ${err}`);
        return Rx.throwError(() => err);
      }),
    ),
  );
}