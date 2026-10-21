import "server-only";
import type { DashboardData, Range, VerificationLevel } from "@/lib/dashboard";
import { areaHa, type Boundary } from "@/lib/geo";
import { supabaseAdmin } from "@/lib/supabase/server";

const DAY = 86_400_000;
const RANGE_MS: Record<Exclude<Range, "all">, number> = { "7d": 7 * DAY, "30d": 30 * DAY, "365d": 365 * DAY };
const STALE_MS = 180 * DAY;
const usd = (raw: string | number) => Number(raw) / 1e6;

// Mirrors the contract's integer split so dashboard totals match on-chain payouts exactly.
function split(totalRaw: bigint) {
  const platform = (totalRaw * 500n) / 10_000n;
  const auditor = (totalRaw * 500n) / 10_000n;
  const government = (totalRaw * 300n) / 10_000n;
  return { owners: totalRaw - platform - auditor - government, auditors: auditor, platform, government };
}

type Offset = { certificate_id: number; buyer: string; project_id: number; listing_id: number; tons: string | number; total_paid: string | number; retired_at: string; tx_hash: string };

export async function computeDashboard(chainId: number, f: { range: Range; province?: string; type?: string }): Promise<DashboardData> {
  const db = supabaseAdmin();
  const [offsetsQ, listingsQ, projectsQ, verQ] = await Promise.all([
    db.from("chain_offsets").select("certificate_id, buyer, project_id, listing_id, tons, total_paid, retired_at, tx_hash").eq("chain_id", chainId),
    db.from("chain_listings").select("project_id, price_per_ton, available").eq("chain_id", chainId),
    db.from("public_projects").select("id, name, province, type, status, area_ha, lat, lng, boundary"),
    db.from("public_verification_events").select("project_id, method, result, created_at").order("created_at", { ascending: false }),
  ]);
  for (const q of [offsetsQ, listingsQ, projectsQ, verQ]) if (q.error) throw new Error(q.error.message);

  const projects = projectsQ.data!.filter((p) => (!f.province || p.province === f.province) && (!f.type || p.type === f.type));
  const inScope = new Set(projects.map((p) => p.id as number));
  const byId = new Map(projects.map((p) => [p.id as number, p]));
  const allOffsets = (offsetsQ.data as Offset[]).filter((o) => inScope.has(o.project_id));

  const now = Date.now();
  const since = f.range === "all" ? -Infinity : now - RANGE_MS[f.range];
  const prevSince = f.range === "all" ? null : since - RANGE_MS[f.range];
  const at = (o: Offset) => Date.parse(o.retired_at);
  const current = allOffsets.filter((o) => at(o) >= since);
  const previous = prevSince === null ? null : allOffsets.filter((o) => at(o) >= prevSince && at(o) < since);

  const totals = (list: Offset[]) => {
    const raw = list.reduce((s, o) => s + BigInt(o.total_paid), 0n);
    return {
      tons: list.reduce((s, o) => s + Number(o.tons), 0),
      raw,
      parts: split(raw),
      buyers: new Set(list.filter((o) => o.listing_id !== 0).map((o) => o.buyer)).size,
    };
  };
  const cur = totals(current);
  const prev = previous && totals(previous);
  const kpi = (v: number, p?: number) => ({ value: v, previous: prev ? p ?? 0 : null });

  // Time series
  const bucket: DashboardData["bucket"] = f.range === "7d" || f.range === "30d" ? "day" : "month";
  const keyOf = (ms: number) => new Date(ms).toISOString().slice(0, bucket === "day" ? 10 : 7);
  // "All time" shows at least six months so a young market still reads as a trend, not a single point.
  const start = f.range === "all" ? Math.min(now - 180 * DAY, ...current.map(at)) : since;
  const series = new Map<string, { tons: number; usd: number }>();
  for (let t = start; t <= now; t += bucket === "day" ? DAY : DAY * 28) series.set(keyOf(t), { tons: 0, usd: 0 });
  series.set(keyOf(now), series.get(keyOf(now)) ?? { tons: 0, usd: 0 });
  for (const o of current) {
    const k = keyOf(at(o));
    const s = series.get(k) ?? { tons: 0, usd: 0 };
    s.tons += Number(o.tons);
    s.usd += usd(o.total_paid);
    series.set(k, s);
  }

  const group = (label: (o: Offset) => string) => {
    const m = new Map<string, number>();
    for (const o of current) m.set(label(o), (m.get(label(o)) ?? 0) + Number(o.tons));
    return [...m.entries()].map(([l, tons]) => ({ label: l, tons })).sort((a, b) => b.tons - a.tons);
  };

  // Verification: latest result per method per project (events are newest-first).
  const latest = new Map<number, Map<string, { result: VerificationLevel; at: string }>>();
  for (const v of verQ.data!) {
    const m = latest.get(v.project_id) ?? new Map();
    if (!m.has(v.method)) m.set(v.method, { result: v.result, at: v.created_at });
    latest.set(v.project_id, m);
  }

  const retiredBy = new Map<number, number>();
  for (const o of allOffsets) retiredBy.set(o.project_id, (retiredBy.get(o.project_id) ?? 0) + Number(o.tons));
  const availBy = new Map<number, number>();
  const priceBy = new Map<number, number>();
  for (const l of listingsQ.data!) {
    if (!inScope.has(l.project_id) || Number(l.available) <= 0) continue;
    availBy.set(l.project_id, (availBy.get(l.project_id) ?? 0) + Number(l.available));
    const p = usd(l.price_per_ton);
    priceBy.set(l.project_id, Math.min(priceBy.get(l.project_id) ?? Infinity, p));
  }

  const projectRows = projects.map((p) => {
    const v = latest.get(p.id) ?? new Map();
    const retired = retiredBy.get(p.id) ?? 0;
    const available = availBy.get(p.id) ?? 0;
    const passed = [...v.values()].filter((x) => x.result === "passed").map((x) => x.at).sort().reverse();
    return {
      id: p.id as number,
      name: p.name as string,
      province: p.province as string,
      type: p.type as string,
      status: p.status as string,
      retired,
      available,
      soldPct: retired + available > 0 ? Math.round((retired / (retired + available)) * 1000) / 10 : 0,
      price: priceBy.get(p.id) ?? null,
      verification: {
        document: v.get("document_review")?.result ?? null,
        satellite: v.get("satellite_analysis")?.result ?? null,
        field: v.get("field_visit")?.result ?? null,
      },
      lastVerified: passed[0] ?? null,
    };
  });

  // Buyers: organisation names only for wallets their owners linked to a profile.
  const tonsByBuyer = new Map<string, { tons: number; certificates: number }>();
  for (const o of current) {
    const b = tonsByBuyer.get(o.buyer) ?? { tons: 0, certificates: 0 };
    b.tons += Number(o.tons);
    b.certificates += 1;
    tonsByBuyer.set(o.buyer, b);
  }
  const { data: profs } = await db.from("profiles").select("org_name, avatar_url, wallet, kyc_status").not("wallet", "is", null);
  const who = new Map((profs ?? []).map((p) => [(p.wallet as string).toLowerCase(), p]));

  const leaderboard = [...tonsByBuyer.entries()]
    .sort((a, b) => b[1].tons - a[1].tons)
    .slice(0, 10)
    .map(([wallet, v]) => {
      const p = who.get(wallet);
      return { wallet, name: p?.org_name ?? null, avatarUrl: p?.avatar_url ?? null, verified: p?.kyc_status === "verified", ...v };
    });

  const recent = [...current]
    .sort((a, b) => at(b) - at(a))
    .slice(0, 10)
    .map((o) => ({
      certificateId: o.certificate_id,
      buyer: o.buyer,
      buyerName: who.get(o.buyer)?.org_name ?? null,
      projectId: o.project_id,
      projectName: (byId.get(o.project_id)?.name as string) ?? `Project #${o.project_id}`,
      tons: Number(o.tons),
      usd: usd(o.total_paid),
      time: o.retired_at,
      txHash: o.tx_hash,
      direct: o.listing_id === 0,
    }));

  const flaggedIds = new Set(projectRows.filter((p) => Object.values(p.verification).some((r) => r && r !== "passed")).map((p) => p.id));

  return {
    generatedAt: new Date(now).toISOString(),
    kpis: {
      retiredTons: kpi(cur.tons, prev?.tons),
      volumeUsd: kpi(usd(cur.raw.toString()), prev ? usd(prev.raw.toString()) : undefined),
      ownersUsd: kpi(usd(cur.parts.owners.toString()), prev ? usd(prev.parts.owners.toString()) : undefined),
      governmentUsd: kpi(usd(cur.parts.government.toString()), prev ? usd(prev.parts.government.toString()) : undefined),
      buyers: kpi(cur.buyers, prev?.buyers),
      verifiedProjects: projects.filter((p) => p.status === "approved").length,
      protectedHa: Math.round(projects.reduce((s, p) => s + (p.boundary ? areaHa(p.boundary as Boundary) : Number(p.area_ha ?? 0)), 0)),
      availableTons: [...availBy.values()].reduce((s, v) => s + v, 0),
    },
    bucket,
    series: [...series.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([t, v]) => ({ t, ...v })),
    split: {
      owners: usd(cur.parts.owners.toString()),
      auditors: usd(cur.parts.auditors.toString()),
      platform: usd(cur.parts.platform.toString()),
      government: usd(cur.parts.government.toString()),
    },
    byType: group((o) => (byId.get(o.project_id)?.type as string) || "Other"),
    byProvince: group((o) => (byId.get(o.project_id)?.province as string) || "Unknown"),
    projects: projectRows.sort((a, b) => b.retired - a.retired),
    leaderboard,
    recent,
    map: projects.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      flagged: flaggedIds.has(p.id),
      retired: retiredBy.get(p.id) ?? 0,
      lat: p.lat,
      lng: p.lng,
      boundary: p.boundary,
    })),
    health: {
      listed: projectRows.length,
      documentReviewed: projectRows.filter((p) => p.verification.document === "passed").length,
      satelliteVerified: projectRows.filter((p) => p.verification.satellite === "passed").length,
      fieldVisited: projectRows.filter((p) => p.verification.field === "passed").length,
      flagged: flaggedIds.size,
      stale: projectRows.filter((p) => !p.lastVerified || now - Date.parse(p.lastVerified) > STALE_MS).length,
    },
  };
}
