import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import path from 'node:path';

export {
  Contract,
  ledger,
  pureCircuits,
  type Ledger,
  type ImpureCircuits,
  type PureCircuits,
} from './managed/threshold/contract/index.js';
import { Contract } from './managed/threshold/contract/index.js';
export * from './witnesses.js';
import * as Witnesses from './witnesses.js';

const currentDir = path.resolve(new URL(import.meta.url).pathname, '..');
export const zkConfigPath = path.resolve(currentDir, 'managed', 'threshold');

export const CompiledThresholdContract = CompiledContract.make<
  Contract<Witnesses.ThresholdPrivateState>
>(
  'ThresholdContract',
  Contract<Witnesses.ThresholdPrivateState>,
).pipe(
  CompiledContract.withWitnesses(Witnesses.witnesses),
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);
