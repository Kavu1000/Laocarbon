import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet, metaMaskWallet } from "@rainbow-me/rainbowkit/wallets";
import { defineChain, type Chain } from "viem";
import { createConfig, http } from "wagmi";

export const localChain = defineChain({
  id: 31337,
  name: "Hardhat Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_LOCAL_RPC_URL || "http://127.0.0.1:8546"] } },
  testnet: true,
});

const labchainRpc = process.env.NEXT_PUBLIC_LABCHAIN_RPC_URL;
const labchainId = Number(process.env.NEXT_PUBLIC_LABCHAIN_CHAIN_ID);
const labchainExplorer = process.env.NEXT_PUBLIC_LABCHAIN_EXPLORER_URL;

export const labchain =
  labchainRpc && labchainId
    ? defineChain({
        id: labchainId,
        name: "Labchain",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [labchainRpc] } },
        ...(labchainExplorer && { blockExplorers: { default: { name: "Explorer", url: labchainExplorer } } }),
        testnet: true,
      })
    : undefined;

const chains = (labchain ? [labchain, localChain] : [localChain]) as [Chain, ...Chain[]];

const connectors = connectorsForWallets([{ groupName: "Wallets", wallets: [metaMaskWallet, injectedWallet] }], {
  appName: "LaoCarbon",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "laocarbon-local",
});

export const wagmiConfig = createConfig({
  chains,
  connectors,
  transports: Object.fromEntries(chains.map((c) => [c.id, http()])),
  ssr: true,
});

export const defaultChain = chains[0];
