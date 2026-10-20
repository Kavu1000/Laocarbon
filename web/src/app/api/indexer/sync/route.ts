import { NextResponse } from "next/server";
import { adminDb, configuredChains, syncChain, type SyncResult } from "@/lib/indexer/core";

// Lets the UI pull fresh chain data into Supabase right after a transaction instead of waiting for the
// next indexer poll. Public, but it only copies public chain facts and runs one sync at a time.

let running: Promise<SyncResult[]> | undefined;
let lastRun = 0;

async function runAll() {
  const db = adminDb(process.env)!;
  const results: SyncResult[] = [];
  for (const target of configuredChains(process.env)) {
    let r: SyncResult;
    let rounds = 0;
    do {
      r = await syncChain(db, target, { confirmations: BigInt(process.env.INDEXER_CONFIRMATIONS ?? 0) });
      results.push(r);
    } while (!r.caughtUp && ++rounds < 5);
  }
  return results;
}

export async function POST() {
  if (!adminDb(process.env)) return NextResponse.json({ error: "Indexer not configured" }, { status: 503 });
  if (!running && Date.now() - lastRun < 1000) return NextResponse.json({ results: [], throttled: true });
  running ??= runAll().finally(() => {
    running = undefined;
    lastRun = Date.now();
  });
  try {
    return NextResponse.json({ results: await running });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sync failed" }, { status: 500 });
  }
}
