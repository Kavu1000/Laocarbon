// Copies LaoCarbonMarketplace state into Supabase so the UI never scans logs from block 0.
// Runs both inside Next (/api/indexer/sync) and as a standalone process (scripts/indexer.ts),
// so it uses relative .ts imports and nothing Next-specific.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { deployments, LaoCarbonMarketplaceAbi as abi } from "../contracts.generated.ts";

export type ProjectRow = { chain_id: number; project_id: number; forest_owner: string; auditor: string; ipfs_hash: string; block_number: number; tx_hash: string };
export type ListingRow = { chain_id: number; listing_id: number; project_id: number; seller: string; price_per_ton: string; available: string; updated_block: number };
export type OffsetRow = {
  chain_id: number; certificate_id: number; buyer: string; project_id: number; listing_id: number; tons: string;
  total_paid: string; ipfs_hash: string; retired_at: string; block_number: number; tx_hash: string;
};
export type Batch = { projects: ProjectRow[]; listings: ListingRow[]; offsets: OffsetRow[] };

/** Reads every relevant event in [from, to] and the resulting listing state as of `to`. Idempotent. */
export async function collect(client: PublicClient, chainId: number, marketplace: Address, from: bigint, to: bigint): Promise<Batch> {
  const range = { address: marketplace, abi, fromBlock: from, toBlock: to } as const;
  const [registered, listed, cancelled, offsets] = await Promise.all([
    client.getContractEvents({ ...range, eventName: "ProjectRegistered" }),
    client.getContractEvents({ ...range, eventName: "Listed" }),
    client.getContractEvents({ ...range, eventName: "ListingCancelled" }),
    client.getContractEvents({ ...range, eventName: "CarbonOffset" }),
  ]);

  // Re-read touched listings at `to` instead of replaying deltas, so retries and overlaps can't double-count.
  const touched = new Set<bigint>([
    ...listed.map((e) => e.args.listingId!),
    ...cancelled.map((e) => e.args.listingId!),
    ...offsets.map((e) => e.args.listingId!),
  ]);
  const listings = await Promise.all(
    [...touched].map(async (id): Promise<ListingRow> => {
      const [projectId, seller, price, available] = await client.readContract({
        address: marketplace, abi, functionName: "listings", args: [id], blockNumber: to,
      });
      return {
        chain_id: chainId, listing_id: Number(id), project_id: Number(projectId), seller: seller.toLowerCase(),
        price_per_ton: price.toString(), available: available.toString(), updated_block: Number(to),
      };
    }),
  );

  return {
    projects: registered.map((e) => ({
      chain_id: chainId, project_id: Number(e.args.projectId), forest_owner: e.args.forestOwner!.toLowerCase(),
      auditor: e.args.auditor!.toLowerCase(), ipfs_hash: e.args.ipfsHash!, block_number: Number(e.blockNumber), tx_hash: e.transactionHash,
    })),
    listings,
    offsets: offsets.map((e) => ({
      chain_id: chainId, certificate_id: Number(e.args.certificateId), buyer: e.args.buyer!.toLowerCase(),
      project_id: Number(e.args.projectId), listing_id: Number(e.args.listingId), tons: e.args.tons!.toString(),
      total_paid: e.args.totalPaid!.toString(), ipfs_hash: e.args.projectIpfsHash!,
      retired_at: new Date(Number(e.args.timestamp) * 1000).toISOString(), block_number: Number(e.blockNumber), tx_hash: e.transactionHash,
    })),
  };
}

async function persist(db: SupabaseClient, chainId: number, batch: Batch, toBlock: bigint) {
  const up = async (table: string, rows: object[], key: string) => {
    if (!rows.length) return;
    const { error } = await db.from(table).upsert(rows, { onConflict: key });
    if (error) throw new Error(`${table}: ${error.message}`);
  };
  await up("chain_projects", batch.projects, "chain_id,project_id");
  await up("chain_listings", batch.listings, "chain_id,listing_id");
  await up("chain_offsets", batch.offsets, "chain_id,certificate_id");
  // Advance the cursor last so a crash just re-processes the same (idempotent) range.
  const { error } = await db.from("indexer_state").upsert({ chain_id: chainId, last_block: Number(toBlock), updated_at: new Date().toISOString() });
  if (error) throw new Error(`indexer_state: ${error.message}`);
}

export type ChainTarget = { chainId: number; rpcUrl: string };

/** Chains with both a deployment and an RPC URL configured. */
export function configuredChains(env: Record<string, string | undefined>): ChainTarget[] {
  const out: ChainTarget[] = [];
  const local = env.INDEXER_LOCAL_RPC_URL || env.NEXT_PUBLIC_LOCAL_RPC_URL;
  if (local && deployments[31337]?.LaoCarbonMarketplace) out.push({ chainId: 31337, rpcUrl: local });
  const labId = Number(env.NEXT_PUBLIC_LABCHAIN_CHAIN_ID);
  const labRpc = env.INDEXER_LABCHAIN_RPC_URL || env.NEXT_PUBLIC_LABCHAIN_RPC_URL;
  if (labId && labRpc && deployments[labId]?.LaoCarbonMarketplace) out.push({ chainId: labId, rpcUrl: labRpc });
  return out;
}

export function adminDb(env: Record<string, string | undefined>) {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) return undefined;
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type SyncResult = { chainId: number; from: number; to: number; projects: number; listings: number; offsets: number; caughtUp: boolean };

/** Indexes up to `maxBlocks` new blocks for one chain. Call repeatedly until caughtUp. */
export async function syncChain(
  db: SupabaseClient,
  target: ChainTarget,
  opts: { maxBlocks?: bigint; confirmations?: bigint; startBlock?: bigint } = {},
): Promise<SyncResult> {
  const { maxBlocks = 5_000n, confirmations = 0n, startBlock = 0n } = opts;
  const marketplace = deployments[target.chainId]!.LaoCarbonMarketplace!;
  const client = createPublicClient({ transport: http(target.rpcUrl) }) as PublicClient;

  const { data: state, error } = await db.from("indexer_state").select("last_block").eq("chain_id", target.chainId).maybeSingle();
  if (error) throw new Error(`indexer_state: ${error.message}`);
  const tip = await client.getBlockNumber();
  const head = tip - confirmations;

  // Cursor ahead of the chain means it was reset (e.g. a restarted Hardhat node): drop stale rows and start over.
  if (state && BigInt(state.last_block) > tip) {
    for (const table of ["chain_offsets", "chain_listings", "chain_projects", "indexer_state"]) {
      const { error: delError } = await db.from(table).delete().eq("chain_id", target.chainId);
      if (delError) throw new Error(`${table}: ${delError.message}`);
    }
    return syncChain(db, target, opts);
  }
  const from = state ? BigInt(state.last_block) + 1n : startBlock;
  if (from > head) return { chainId: target.chainId, from: Number(from), to: Number(head), projects: 0, listings: 0, offsets: 0, caughtUp: true };

  const to = from + maxBlocks - 1n < head ? from + maxBlocks - 1n : head;
  const batch = await collect(client, target.chainId, marketplace, from, to);
  await persist(db, target.chainId, batch, to);
  return {
    chainId: target.chainId, from: Number(from), to: Number(to),
    projects: batch.projects.length, listings: batch.listings.length, offsets: batch.offsets.length, caughtUp: to === head,
  };
}
