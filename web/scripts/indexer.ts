// Long-running indexer: keeps Supabase in sync with the marketplace contract.
// Usage: npm run indexer          (loops)
//        npm run indexer -- --once  (catch up once and exit)
import { adminDb, configuredChains, syncChain } from "../src/lib/indexer/core.ts";

const POLL_MS = Number(process.env.INDEXER_POLL_MS ?? 3000);
const opts = {
  maxBlocks: BigInt(process.env.INDEXER_BATCH_BLOCKS ?? 5000),
  confirmations: BigInt(process.env.INDEXER_CONFIRMATIONS ?? 0),
  startBlock: BigInt(process.env.INDEXER_START_BLOCK ?? 0),
};

const db = adminDb(process.env);
const chains = configuredChains(process.env);
if (!db) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in web/.env.local");
  process.exit(1);
}
if (!chains.length) {
  console.error("No chain to index: set NEXT_PUBLIC_LOCAL_RPC_URL (and deploy + export), or the Labchain variables.");
  process.exit(1);
}

const once = process.argv.includes("--once");
console.log(`Indexing chains ${chains.map((c) => c.chainId).join(", ")}${once ? " (once)" : ` every ${POLL_MS}ms`}`);

for (;;) {
  for (const target of chains) {
    try {
      let r;
      do {
        r = await syncChain(db, target, opts);
        if (r.from <= r.to) {
          console.log(`[${target.chainId}] blocks ${r.from}-${r.to}: +${r.projects} projects, ${r.listings} listings, +${r.offsets} offsets`);
        }
      } while (!r.caughtUp);
    } catch (e) {
      console.error(`[${target.chainId}]`, e instanceof Error ? e.message : e);
    }
  }
  if (once) break;
  await new Promise((r) => setTimeout(r, POLL_MS));
}
