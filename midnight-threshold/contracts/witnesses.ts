import { type Ledger } from './managed/threshold/contract/index.js';
import { type WitnessContext } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';

// Private state held entirely on the prover's own machine. The score
// never leaves this object - it is read locally by the score() witness
// and used only inside proof generation. It is never sent to the
// indexer, the proof server's network interface, or the chain.
export type ThresholdPrivateState = {
  readonly score: bigint;
};

export const createThresholdPrivateState = (
  score: bigint,
): ThresholdPrivateState => ({ score });

export const witnesses = {
  score: (
    { privateState }: WitnessContext<Ledger, ThresholdPrivateState>,
  ): [ThresholdPrivateState, bigint] => [privateState, privateState.score],
};
