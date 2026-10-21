import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/admin";
import { contractRoles, payoutWallets } from "@/lib/server/chain";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const actor = await requireAdmin();
  if (actor instanceof NextResponse) return actor;
  const chainId = Number(new URL(req.url).searchParams.get("chainId"));
  const db = supabaseAdmin();

  const [profiles, projects, offsets, roles, wallets] = await Promise.all([
    db.from("profiles").select("role, kyc_status, suspended"),
    db.from("projects").select("status"),
    db.from("chain_offsets").select("total_paid").eq("chain_id", chainId),
    contractRoles(chainId).catch(() => undefined),
    payoutWallets(chainId).catch(() => undefined),
  ]);
  for (const q of [profiles, projects, offsets]) if (q.error) return NextResponse.json({ error: q.error.message }, { status: 500 });

  const count = <T,>(rows: T[], key: (r: T) => string) =>
    rows.reduce<Record<string, number>>((m, r) => ((m[key(r)] = (m[key(r)] ?? 0) + 1), m), {});

  const totalRaw = offsets.data!.reduce((s, o) => s + BigInt(o.total_paid), 0n);
  const share = (bps: bigint) => Number((totalRaw * bps) / 10_000n) / 1e6;

  return NextResponse.json({
    users: {
      total: profiles.data!.length,
      byRole: count(profiles.data!, (p) => p.role),
      suspended: profiles.data!.filter((p) => p.suspended).length,
      kycPending: profiles.data!.filter((p) => p.kyc_status === "pending").length,
    },
    projects: count(projects.data!.filter((p) => p.status !== "draft"), (p) => p.status),
    finance: {
      volume: Number(totalRaw) / 1e6,
      platform: share(500n),
      government: share(300n),
      auditors: share(500n),
      owners: Number(totalRaw) / 1e6 - share(500n) - share(300n) - share(500n),
    },
    roles: roles?.holders ?? [],
    wallets: wallets ?? null,
  });
}
