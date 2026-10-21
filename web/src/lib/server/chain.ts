import "server-only";
import { createPublicClient, http, keccak256, toHex, zeroHash, type Address, type PublicClient } from "viem";
import { configuredChains } from "@/lib/indexer/core";
import {
  deployments,
  LaoCarbonCertificateAbi,
  LaoCarbonMarketplaceAbi,
  LaoCarbonTokenAbi,
} from "@/lib/contracts.generated";

export function chainClient(chainId: number): PublicClient | undefined {
  const target = configuredChains(process.env).find((c) => c.chainId === chainId);
  return target ? (createPublicClient({ transport: http(target.rpcUrl) }) as PublicClient) : undefined;
}

const ROLE_NAMES: Record<string, string> = {
  [zeroHash]: "DEFAULT_ADMIN_ROLE",
  [keccak256(toHex("REGISTRAR_ROLE"))]: "REGISTRAR_ROLE",
  [keccak256(toHex("MINTER_ROLE"))]: "MINTER_ROLE",
};

export type RoleEvent = {
  contract: string;
  role: string;
  account: Address;
  sender: Address;
  granted: boolean;
  txHash: string;
  timestamp: number;
};
export type RoleHolders = { contract: string; address: Address; role: string; holders: Address[] }[];

/** Every RoleGranted/RoleRevoked on the three contracts, plus the resulting current holders. */
export async function contractRoles(chainId: number): Promise<{ events: RoleEvent[]; holders: RoleHolders } | undefined> {
  const client = chainClient(chainId);
  const d = deployments[chainId];
  if (!client || !d?.LaoCarbonMarketplace || !d.LaoCarbonToken || !d.LaoCarbonCertificate) return undefined;

  const contracts = [
    { name: "Marketplace", address: d.LaoCarbonMarketplace, abi: LaoCarbonMarketplaceAbi },
    { name: "Carbon Token", address: d.LaoCarbonToken, abi: LaoCarbonTokenAbi },
    { name: "Certificate (SBT)", address: d.LaoCarbonCertificate, abi: LaoCarbonCertificateAbi },
  ] as const;

  const events: (Omit<RoleEvent, "timestamp"> & { block: bigint })[] = [];
  for (const c of contracts) {
    for (const eventName of ["RoleGranted", "RoleRevoked"] as const) {
      const logs = await client.getContractEvents({ address: c.address, abi: c.abi, eventName, fromBlock: 0n });
      for (const l of logs) {
        const args = l.args as { role: `0x${string}`; account: Address; sender: Address };
        events.push({
          contract: c.name,
          role: ROLE_NAMES[args.role] ?? args.role,
          account: args.account,
          sender: args.sender,
          granted: eventName === "RoleGranted",
          txHash: l.transactionHash,
          block: l.blockNumber,
        });
      }
    }
  }
  events.sort((a, b) => Number(a.block - b.block));

  const blockTimes = new Map<bigint, number>();
  await Promise.all(
    [...new Set(events.map((e) => e.block))].map(async (b) => blockTimes.set(b, Number((await client.getBlock({ blockNumber: b })).timestamp))),
  );

  const current = new Map<string, Set<Address>>();
  for (const e of events) {
    const key = `${e.contract}|${e.role}`;
    const set = current.get(key) ?? new Set<Address>();
    if (e.granted) set.add(e.account);
    else set.delete(e.account);
    current.set(key, set);
  }
  const holders: RoleHolders = contracts.flatMap((c) =>
    [...current.entries()]
      .filter(([k]) => k.startsWith(`${c.name}|`))
      .map(([k, set]) => ({ contract: c.name, address: c.address, role: k.split("|")[1], holders: [...set] })),
  );

  return {
    events: events.map(({ block, ...e }) => ({ ...e, timestamp: blockTimes.get(block)! })).reverse(),
    holders,
  };
}

/** Where the 5% platform and 3% government shares are paid. */
export async function payoutWallets(chainId: number) {
  const client = chainClient(chainId);
  const market = deployments[chainId]?.LaoCarbonMarketplace;
  if (!client || !market) return undefined;
  const [platform, government] = await Promise.all([
    client.readContract({ address: market, abi: LaoCarbonMarketplaceAbi, functionName: "platformWallet" }),
    client.readContract({ address: market, abi: LaoCarbonMarketplaceAbi, functionName: "governmentWallet" }),
  ]);
  return { platform, government };
}
