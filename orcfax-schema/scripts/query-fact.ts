import axios from "axios";

async function queryFact() {
  const BLOCKFROST_API = "https://cardano-preprod.blockfrost.io/api/v0";
  
  // SECURE: Pulls the API key from the local environment variables
  const API_KEY = process.env.BLOCKFROST_API_KEY;

  if (!API_KEY) {
    console.error("⚠️ Missing BLOCKFROST_API_KEY in environment variables.");
    return;
  }
  
  console.log("🔍 Bypassing legacy Lucid engine...");
  console.log("📡 Querying Blockfrost directly for the latest Preprod network state...\n");

  try {
    const response = await axios.get(`${BLOCKFROST_API}/blocks/latest`, {
      headers: { project_id: API_KEY },
    });
    
    console.log("✅ On-chain Query Successful. Latest Preprod Block Retrieved:");
    console.log({
      block_height: response.data.height,
      hash: response.data.hash,
      slot: response.data.slot,
      confirmations: response.data.confirmations
    });
    
  } catch (error: any) {
    console.error("⚠️ Query Failed:", error.response?.data?.message || error.message);
  }
}

queryFact();
