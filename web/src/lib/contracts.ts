import { useAccount } from "wagmi";
import { deployments } from "./contracts.generated";
import { defaultChain } from "./wagmi";

export {
  LaoCarbonCertificateAbi as certificateAbi,
  LaoCarbonMarketplaceAbi as marketplaceAbi,
  LaoCarbonTokenAbi as carbonTokenAbi,
  MockUSDTAbi as usdtAbi,
} from "./contracts.generated";

export const USDT_DECIMALS = 6;

/** Contract addresses for the wallet's chain, or the default read chain when no wallet is connected. */
export function useContracts() {
  const { chainId: walletChainId, isConnected } = useAccount();
  const chainId = isConnected && walletChainId ? walletChainId : defaultChain.id;
  const d = deployments[chainId];
  if (!d?.LaoCarbonMarketplace || !d.LaoCarbonToken || !d.LaoCarbonCertificate || !d.MockUSDT) {
    return { chainId, ready: false as const };
  }
  return {
    chainId,
    ready: true as const,
    marketplace: d.LaoCarbonMarketplace,
    carbonToken: d.LaoCarbonToken,
    certificate: d.LaoCarbonCertificate,
    usdt: d.MockUSDT,
  };
}
