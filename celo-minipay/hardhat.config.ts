import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

// Private key is read from .env (never hardcode it — see REPORT.md). A dummy key keeps compile/test
// working offline; a real key is only needed for live deploy to Celo Sepolia.
const PRIVATE_KEY =
  process.env.PRIVATE_KEY ||
  "0x0000000000000000000000000000000000000000000000000000000000000001";

const CELO_SEPOLIA_RPC_URL =
  process.env.CELO_SEPOLIA_RPC_URL || "https://forno.celo-sepolia.celo-testnet.org";

const config: HardhatUserConfig = {
  solidity: "0.8.19",
  networks: {
    // Celo Sepolia — the live testnet that replaced the deprecated Alfajores (see REPORT.md).
    celoSepolia: {
      url: CELO_SEPOLIA_RPC_URL,
      chainId: 11142220,
      accounts: [PRIVATE_KEY],
    },
    // alfajores: {  // DEPRECATED — sunset with Holesky (Sep 2025). Kept for provenance only.
    //   url: "https://alfajores-forno.celo-testnet.org",
    //   chainId: 44787,
    //   accounts: [PRIVATE_KEY],
    // },
  },
  // Verification. Blockscout + Sourcify need NO API key (recommended). Celoscan uses the unified
  // Etherscan v2 API with a single ETHERSCAN_API_KEY.
  sourcify: {
    enabled: true,
  },
  etherscan: {
    apiKey: {
      celoSepolia: process.env.ETHERSCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "celoSepolia",
        chainId: 11142220,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",
          browserURL: "https://sepolia.celoscan.io",
        },
      },
    ],
  },
};

export default config;
