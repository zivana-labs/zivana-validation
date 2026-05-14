import axios from "axios";

const AGENT_URL = "http://localhost:8080/cloud-agent";

async function issueCredential() {
  // 1. Create a DID
  const didRes = await axios.post(`${AGENT_URL}/did`, {
    method: "prism",
  });
  const issuerDid = didRes.data.did;
  console.log("Issuer DID:", issuerDid);

  // 2. Define a schema (contributor role)
  const schemaRes = await axios.post(`${AGENT_URL}/schema`, {
    type: "https://schema.org/ContributorRole",
    properties: {
      role: { type: "string" },
      jurisdiction: { type: "string" },
    },
  });
  const schemaId = schemaRes.data.id;

  // 3. Issue a credential to a new DID
  const holderDidRes = await axios.post(`${AGENT_URL}/did`, { method: "prism" });
  const holderDid = holderDidRes.data.did;

  const credentialRes = await axios.post(`${AGENT_URL}/credentials/issue`, {
    schemaId,
    issuer: issuerDid,
    subject: holderDid,
    claims: {
      role: "contributor",
      jurisdiction: "NG",
    },
  });
  console.log("Credential issued:", credentialRes.data);
  // The DID document anchor will appear on Cardano preprod
}

issueCredential().catch(console.error);
