import "server-only";
import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

export type AdminActor = { id: string; name: string };

/** Resolves the signed-in admin, or a ready-to-return error response. */
export async function requireAdmin(): Promise<AdminActor | NextResponse> {
  const { data } = await (await supabaseServer()).auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: p } = await supabaseAdmin()
    .from("profiles")
    .select("full_name, org_name, role, suspended")
    .eq("id", data.user.id)
    .single();
  if (!p || p.role !== "admin" || p.suspended) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  return { id: data.user.id, name: `${p.full_name} · ${p.org_name}` };
}

/** Admin API changes run with the service key, so DB triggers can't see who made them; log them here. */
export async function logAdminAction(
  actor: AdminActor,
  action: string,
  target: { type: string; id: string; label: string },
  details: Record<string, unknown> = {},
) {
  const { error } = await supabaseAdmin().from("governance_log").insert({
    actor_id: actor.id,
    actor_name: actor.name,
    actor_role: "admin",
    action,
    target_type: target.type,
    target_id: target.id,
    target_label: target.label,
    details,
  });
  if (error) throw new Error(`governance_log: ${error.message}`);
}

export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || new URL(origin).host === req.headers.get("host");
}
