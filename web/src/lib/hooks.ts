"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAddress, type Address } from "viem";
import { usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { authConfigured } from "./auth";
import { marketplaceAbi, useContracts } from "./contracts";
import { supabase } from "./supabase/client";

// Reads come from the Supabase index (fast) once the indexer has data for this chain,
// and fall back to querying the chain directly otherwise. Writes always go on-chain.

export type Listing = { listingId: bigint; projectId: bigint; seller: Address; pricePerTon: bigint; available: bigint };
export type RegisteredProject = { forestOwner: Address; auditor: Address; ipfsHash: string };
export type Offset = {
  certificateId: bigint;
  buyer: Address;
  projectId: bigint;
  listingId: bigint;
  tons: bigint;
  totalPaid: bigint;
  ipfsHash: string;
  timestamp: bigint;
  txHash: `0x${string}`;
};

/** True when the indexer has synced this chain into Supabase. */
export function useIndexed(chainId: number) {
  const { data } = useQuery({
    queryKey: ["indexer-ready", chainId],
    enabled: authConfigured,
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase().from("indexer_state").select("last_block").eq("chain_id", chainId).maybeSingle();
      return !error && !!data;
    },
  });
  return authConfigured && data === true;
}

async function rows<T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

// ---------------------------------------------------------------- listings

export function useListings() {
  const c = useContracts();
  const indexed = useIndexed(c.chainId);

  const fromIndex = useQuery({
    queryKey: ["listings", c.chainId, "index"],
    enabled: indexed,
    queryFn: async () =>
      (
        await rows<{ listing_id: number; project_id: number; seller: string; price_per_ton: string; available: string }>(
          supabase().from("chain_listings").select("listing_id, project_id, seller, price_per_ton, available").eq("chain_id", c.chainId).order("listing_id"),
        )
      ).map((r): Listing => ({
        listingId: BigInt(r.listing_id),
        projectId: BigInt(r.project_id),
        seller: getAddress(r.seller),
        pricePerTon: BigInt(r.price_per_ton),
        available: BigInt(r.available),
      })),
  });

  const { data: nextId } = useReadContract({
    address: c.ready ? c.marketplace : undefined,
    abi: marketplaceAbi,
    functionName: "nextListingId",
    chainId: c.chainId,
    query: { enabled: c.ready && !indexed },
  });
  const ids = !indexed && nextId ? Array.from({ length: Number(nextId) - 1 }, (_, i) => BigInt(i + 1)) : [];
  const fromChain = useReadContracts({
    contracts: ids.map((id) => ({
      address: c.ready ? c.marketplace : undefined,
      abi: marketplaceAbi,
      functionName: "listings" as const,
      args: [id] as const,
      chainId: c.chainId,
    })),
    query: { enabled: c.ready && ids.length > 0 },
  });

  if (indexed) return { listings: fromIndex.data ?? [], isLoading: fromIndex.isLoading, ready: c.ready };
  const listings: Listing[] = (fromChain.data ?? []).flatMap((r, i) => {
    if (r.status !== "success") return [];
    const [projectId, seller, pricePerTon, available] = r.result as readonly [bigint, Address, bigint, bigint];
    return [{ listingId: ids[i], projectId, seller, pricePerTon, available }];
  });
  return { listings, isLoading: fromChain.isLoading || nextId === undefined, ready: c.ready };
}

// ---------------------------------------------------------------- registered projects

export function useRegisteredProjects() {
  const c = useContracts();
  const indexed = useIndexed(c.chainId);
  const client = usePublicClient({ chainId: c.chainId });
  return useQuery({
    queryKey: ["registered-projects", c.chainId, indexed ? "index" : "chain"],
    enabled: indexed || (c.ready && !!client),
    queryFn: async (): Promise<Map<number, RegisteredProject>> => {
      if (indexed) {
        const data = await rows<{ project_id: number; forest_owner: string; auditor: string; ipfs_hash: string }>(
          supabase().from("chain_projects").select("project_id, forest_owner, auditor, ipfs_hash").eq("chain_id", c.chainId),
        );
        return new Map(data.map((r) => [r.project_id, { forestOwner: getAddress(r.forest_owner), auditor: getAddress(r.auditor), ipfsHash: r.ipfs_hash }]));
      }
      if (!c.ready || !client) return new Map();
      const logs = await client.getContractEvents({ address: c.marketplace, abi: marketplaceAbi, eventName: "ProjectRegistered", fromBlock: 0n });
      return new Map(logs.map((l) => [Number(l.args.projectId), { forestOwner: l.args.forestOwner!, auditor: l.args.auditor!, ipfsHash: l.args.ipfsHash! }]));
    },
  });
}

// ---------------------------------------------------------------- offsets / certificates

type OffsetDbRow = {
  certificate_id: number; buyer: string; project_id: number; listing_id: number; tons: string; total_paid: string;
  ipfs_hash: string; retired_at: string; tx_hash: string;
};
const fromDb = (r: OffsetDbRow): Offset => ({
  certificateId: BigInt(r.certificate_id),
  buyer: getAddress(r.buyer),
  projectId: BigInt(r.project_id),
  listingId: BigInt(r.listing_id),
  tons: BigInt(r.tons),
  totalPaid: BigInt(r.total_paid),
  ipfsHash: r.ipfs_hash,
  timestamp: BigInt(Math.floor(new Date(r.retired_at).getTime() / 1000)),
  txHash: r.tx_hash as `0x${string}`,
});

export function useOffsets(buyer?: Address) {
  const c = useContracts();
  const indexed = useIndexed(c.chainId);
  const client = usePublicClient({ chainId: c.chainId });
  return useQuery({
    queryKey: ["offsets", c.chainId, buyer?.toLowerCase() ?? "all", indexed ? "index" : "chain"],
    enabled: indexed || (c.ready && !!client),
    queryFn: async (): Promise<Offset[]> => {
      if (indexed) {
        let q = supabase().from("chain_offsets").select("*").eq("chain_id", c.chainId).order("certificate_id", { ascending: false });
        if (buyer) q = q.eq("buyer", buyer.toLowerCase());
        return (await rows<OffsetDbRow>(q)).map(fromDb);
      }
      if (!c.ready || !client) return [];
      const logs = await client.getContractEvents({
        address: c.marketplace,
        abi: marketplaceAbi,
        eventName: "CarbonOffset",
        args: buyer ? { buyer } : undefined,
        fromBlock: 0n,
      });
      return logs
        .map((l) => ({
          certificateId: l.args.certificateId!,
          buyer: l.args.buyer!,
          projectId: l.args.projectId!,
          listingId: l.args.listingId!,
          tons: l.args.tons!,
          totalPaid: l.args.totalPaid!,
          ipfsHash: l.args.projectIpfsHash!,
          timestamp: l.args.timestamp!,
          txHash: l.transactionHash,
        }))
        .reverse();
    },
  });
}

/** Marketplace-wide retired total without downloading every offset when the index is available. */
export function useRetiredTotal() {
  const c = useContracts();
  const indexed = useIndexed(c.chainId);
  const all = useOffsets();
  const totals = useQuery({
    queryKey: ["offset-totals", c.chainId],
    enabled: indexed,
    queryFn: async () => {
      const [r] = await rows<{ tons: string }>(supabase().from("chain_offset_totals").select("tons").eq("chain_id", c.chainId));
      return BigInt(r?.tons ?? 0);
    },
  });
  if (indexed) return totals.data ?? 0n;
  return (all.data ?? []).reduce((s, o) => s + o.tons, 0n);
}

/** After a transaction: pull it into the index, then refresh every chain-derived query. */
export function useAfterTx() {
  const queryClient = useQueryClient();
  return async () => {
    if (authConfigured) await fetch("/api/indexer/sync", { method: "POST" }).catch(() => undefined);
    await queryClient.invalidateQueries();
  };
}
