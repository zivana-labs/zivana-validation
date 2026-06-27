import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import path from 'node:path';

export {
  Contract as MultiContract,
  ledger as multiLedger,
  pureCircuits as multiPureCircuits,
  Tier,
  type Ledger as MultiLedger,
  type ImpureCircuits as MultiImpureCircuits,
  type PureCircuits as MultiPureCircuits,
} from './managed/threshold-multi/contract/index.js';
import { Contract as MultiContract } from './managed/threshold-multi/contract/index.js';
import * as Witnesses from './witnesses.js';

type MultiPS = Witnesses.ThresholdPrivateState;

const currentDir = path.resolve(new URL(import.meta.url).pathname, '..');
export const multiZkConfigPath = path.resolve(currentDir, 'managed', 'threshold-multi');

const multiContractType = MultiContract<MultiPS>;

export const CompiledMultiThresholdContract = CompiledContract.make(
  'MultiThresholdContract',
  multiContractType,
).pipe(
  CompiledContract.withWitnesses(Witnesses.witnesses),
  CompiledContract.withCompiledFileAssets(multiZkConfigPath),
);