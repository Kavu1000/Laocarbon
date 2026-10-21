import { NextResponse } from "next/server";
import type { AdminUser } from "@/lib/governance";
import { requireAdmin } from "@/lib/server/admin";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  const actor = await requireAdmin();
  if (actor instanceof NextResponse) return actor;
  const db = supabaseAdmin();
  const [{ data: profiles, error }, auth] = await Promise.all([
    db.from("profiles").select("id, full_name, org_name, role, kyc_status, suspended, wallet, created_at").order("created_at", { ascending: false }),
    db.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  if (error || auth.error) return NextResponse.json({ error: (error ?? auth.error)!.message }, { status: 500 });
  const authById = new Map(auth.data.users.map((u) => [u.id, u]));
  const users: AdminUser[] = profiles.map((p) => ({
    id: p.id,
    email: authById.get(p.id)?.email ?? "",
    fullName: p.full_name,
    orgName: p.org_name,
    role: p.role,
    kycStatus: p.kyc_status,
    suspended: p.suspended,
    wallet: p.wallet,
    createdAt: p.created_at,
    lastSignIn: authById.get(p.id)?.last_sign_in_at ?? null,
  }));
  return NextResponse.json({ users });
}
