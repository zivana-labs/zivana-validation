import { readFileSync } from "fs";
import { join } from "path";
import { validateClaim } from "../src/schema/validate";

const DOCUMENT_PATH = join(__dirname, "../schemas/revenue-event.jsonld");

function main() {
  const document: any = JSON.parse(readFileSync(DOCUMENT_PATH, "utf-8"));

  try {
    validateClaim(document);
  } catch (err) {
    console.error("Schema validation FAILED:");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log("Schema validation PASSED");
  console.log(`  identifier: ${document.identifier}`);
  console.log(`  temporalCoverage: ${document.temporalCoverage}`);
  console.log(`  revenue: ${document.about.value.value} ${document.about.value.currency}`);
  console.log(`  participant: ${document.about.observationAbout.identifier}`);
}

main();
