import { NextResponse } from "next/server";
import { contractRoles } from "@/lib/server/chain";
import { supabaseAdmin } from "@/lib/supabase/server";

// Public audit trail: privileged off-chain decisions (governance_log) next to on-chain permission
// changes and project registrations, which anyone can also verify on a block explorer.
export async function GET(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const chainId = Number(new URL(req.url).searchParams.get("chainId"));
  const db = supabaseAdmin();
  const [log, registrations, roles] = await Promise.all([
    db.from("governance_log").select("*").order("created_at", { ascending: false }).limit(300),
    Number.isInteger(chainId)
      ? db.from("chain_projects").select("project_id, forest_owner, auditor, block_number, tx_hash").eq("chain_id", chainId)
      : Promise.resolve({ data: [], error: null }),
    Number.isInteger(chainId) ? contractRoles(chainId).catch(() => undefined) : Promise.resolve(undefined),
  ]);
  if (log.error) return NextResponse.json({ error: log.error.message }, { status: 500 });
  return NextResponse.json({
    offchain: log.data,
    registrations: registrations.data ?? [],
    roleEvents: roles?.events ?? [],
  });
}
