import { NextResponse } from "next/server";
import type { Participant, ParticipantsResponse } from "@/lib/participants";
import { supabaseAdmin } from "@/lib/supabase/server";

// Who owns and who has offset each listing, for the marketplace cards. Profiles are private under RLS,
// so this returns only the public-facing fields (organisation name, logo, KYC badge) and only for
// wallets that appear on-chain as an owner or buyer.

const MAX_BUYERS = 5;

export async function GET(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const chainId = Number(new URL(req.url).searchParams.get("chainId"));
  if (!Number.isInteger(chainId)) return NextResponse.json({ error: "chainId required" }, { status: 400 });

  const db = supabaseAdmin();
  const [offsets, owners] = await Promise.all([
    db.from("chain_offsets").select("listing_id, buyer, tons").eq("chain_id", chainId),
    db.from("chain_projects").select("project_id, forest_owner").eq("chain_id", chainId),
  ]);
  if (offsets.error || owners.error) return NextResponse.json({ error: "Index unavailable" }, { status: 503 });

  const wallets = new Set<string>([...offsets.data.map((o) => o.buyer), ...owners.data.map((o) => o.forest_owner)]);
  const profiles = new Map<string, { name: string; avatarUrl: string | null; verified: boolean }>();
  if (wallets.size) {
    const { data } = await db.from("profiles").select("org_name, avatar_url, wallet, kyc_status").not("wallet", "is", null);
    for (const p of data ?? []) {
      const w = (p.wallet as string).toLowerCase();
      if (wallets.has(w)) profiles.set(w, { name: p.org_name, avatarUrl: p.avatar_url, verified: p.kyc_status === "verified" });
    }
  }
  const who = (wallet: string): Participant => {
    const p = profiles.get(wallet);
    return { wallet, name: p?.name ?? null, avatarUrl: p?.avatarUrl ?? null, verified: p?.verified ?? false };
  };

  // Aggregate tons per listing and per buyer (numeric columns may arrive as numbers or strings).
  const byListing = new Map<number, Map<string, bigint>>();
  for (const o of offsets.data) {
    const m = byListing.get(o.listing_id) ?? new Map<string, bigint>();
    m.set(o.buyer, (m.get(o.buyer) ?? 0n) + BigInt(o.tons));
    byListing.set(o.listing_id, m);
  }

  const listings: ParticipantsResponse["listings"] = {};
  for (const [listingId, buyers] of byListing) {
    const sorted = [...buyers.entries()].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
    listings[listingId] = {
      retiredTons: sorted.reduce((s, [, t]) => s + t, 0n).toString(),
      buyerCount: sorted.length,
      buyers: sorted.slice(0, MAX_BUYERS).map(([w, t]) => ({ ...who(w), tons: t.toString() })),
    };
  }

  const ownersOut: ParticipantsResponse["owners"] = {};
  for (const o of owners.data) ownersOut[o.project_id] = who(o.forest_owner);

  return NextResponse.json({ listings, owners: ownersOut } satisfies ParticipantsResponse, {
    headers: { "cache-control": "public, max-age=10, stale-while-revalidate=60" },
  });
}
