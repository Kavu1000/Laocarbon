import { HardhatUserConfig, vars } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const LABCHAIN_RPC_URL = vars.get("LABCHAIN_RPC_URL", "");
const DEPLOYER_KEY = vars.get("DEPLOYER_KEY", "");

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris" },
  },
  networks: {
    localhost: { url: process.env.LOCAL_RPC_URL ?? "http://127.0.0.1:8545" },
    ...(LABCHAIN_RPC_URL && {
      labchain: { url: LABCHAIN_RPC_URL, accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [] },
    }),
  },
};

export default config;
