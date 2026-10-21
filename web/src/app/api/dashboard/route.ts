import { NextResponse } from "next/server";
import { RANGES, type DashboardData, type Range } from "@/lib/dashboard";
import { computeDashboard } from "@/lib/server/stats";

// Public, read-only aggregates. Cached briefly so a busy dashboard doesn't recompute per viewer.
const cache = new Map<string, { at: number; data: DashboardData }>();
const TTL_MS = 15_000;

export async function GET(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const q = new URL(req.url).searchParams;
  const chainId = Number(q.get("chainId"));
  const range = (RANGES.some((r) => r.id === q.get("range")) ? q.get("range") : "all") as Range;
  const province = q.get("province") || undefined;
  const type = q.get("type") || undefined;
  if (!Number.isInteger(chainId)) return NextResponse.json({ error: "chainId required" }, { status: 400 });

  const key = JSON.stringify([chainId, range, province, type]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json(hit.data);
  try {
    const data = await computeDashboard(chainId, { range, province, type });
    cache.set(key, { at: Date.now(), data });
    return NextResponse.json(data, { headers: { "cache-control": "public, max-age=15" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
