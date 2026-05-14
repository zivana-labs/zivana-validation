import axios from "axios";

// Orcfax testnet publisher endpoint (hypothetical; actual may differ)
const ORCFAX_TESTNET = "https://testnet.orcfax.io/publish";

async function publishFact() {
  const fact = require("../schemas/revenue-event.jsonld");
  const response = await axios.post(ORCFAX_TESTNET, fact, {
    headers: { "Content-Type": "application/ld+json" },
  });
  console.log("Fact statement published:", response.data);
}

publishFact();
