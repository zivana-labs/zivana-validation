import { readFileSync } from "fs";
import { join } from "path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const SCHEMA_PATH = join(__dirname, "../../schemas/revenue-event.schema.json");

/** Validates a parsed revenue-event JSON-LD document against
 * schemas/revenue-event.schema.json. Throws with the ajv error detail if
 * the document doesn't conform. */
export function validateClaim(document: unknown): void {
  const schema: object = JSON.parse(readFileSync(SCHEMA_PATH, "utf-8"));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile<any>(schema);

  if (!validate(document)) {
    throw new Error(
      "revenue-event.jsonld failed schema validation:\n" +
        JSON.stringify(validate.errors, null, 2)
    );
  }
}
