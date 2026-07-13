import { readFileSync } from "fs";
import { join } from "path";
import {
  applyDoubleCborEncoding,
  applyParamsToScript,
  getAddressDetails,
  validatorToAddress,
  validatorToScriptHash,
  type MintingPolicy,
  type Network,
  type SpendingValidator,
} from "@lucid-evolution/lucid";

const BLUEPRINT_PATH = join(__dirname, "../../onchain/plutus.json");

interface BlueprintValidator {
  title: string;
  compiledCode: string;
}

function loadValidatorCompiledCode(title: string): string {
  const blueprint = JSON.parse(readFileSync(BLUEPRINT_PATH, "utf-8"));
  const entry = (blueprint.validators as BlueprintValidator[]).find(
    (v) => v.title === title
  );
  if (!entry) {
    throw new Error(`Validator "${title}" not found in ${BLUEPRINT_PATH}`);
  }
  return entry.compiledCode;
}

export interface PublisherScript {
  publisherPkh: string;
  mintingPolicy: MintingPolicy;
  spendingValidator: SpendingValidator;
  policyId: string;
  scriptAddress: string;
}

/** Applies the wallet's payment key hash as the `publisher` parameter to
 * the revenue_fact validator, deriving the resulting policy id / script
 * address for this run. */
export function buildPublisherScript(
  publisherAddress: string,
  network: Network
): PublisherScript {
  const details = getAddressDetails(publisherAddress);
  if (!details.paymentCredential) {
    throw new Error("Publisher address has no payment credential");
  }
  const publisherPkh = details.paymentCredential.hash;

  const mintCompiledCode = applyDoubleCborEncoding(
    loadValidatorCompiledCode("revenue_fact.revenue_fact.mint")
  );
  const script = applyParamsToScript(mintCompiledCode, [publisherPkh]);

  const mintingPolicy: MintingPolicy = { type: "PlutusV3", script };
  const spendingValidator: SpendingValidator = { type: "PlutusV3", script };

  return {
    publisherPkh,
    mintingPolicy,
    spendingValidator,
    policyId: validatorToScriptHash(mintingPolicy),
    scriptAddress: validatorToAddress(network, spendingValidator),
  };
}
