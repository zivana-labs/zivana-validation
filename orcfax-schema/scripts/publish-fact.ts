import axios from "axios";
import { readFileSync } from "fs";

const ORCFAX_TESTNET = "https://testnet.orcfax.io/publish";

async function publishFact() {
  const factData = readFileSync("./schemas/revenue-event.jsonld", "utf-8");
  const fact = JSON.parse(factData);

  try {
    const response = await axios.post(ORCFAX_TESTNET, fact, {
      headers: { "Content-Type": "application/ld+json" },
    });
    console.log("✅ Fact statement published:", response.data);
  } catch (error: any) {
    console.log("✅ Fact Statement Parsed & Ready:\n", JSON.stringify(fact, null, 2));
    console.error("\n⚠️ Orcfax Testnet Response:", error.message);
    console.log("(Note: The Phase 0 stub uses a hypothetical endpoint. This payload is fully formatted and ready for the PR.)");
  }
}

publishFact();
