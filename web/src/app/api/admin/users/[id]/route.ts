import { NextResponse } from "next/server";
import { logAdminAction, requireAdmin, sameOrigin } from "@/lib/server/admin";
import { supabaseAdmin } from "@/lib/supabase/server";

const ROLES = ["buyer", "forest_owner", "auditor", "admin"] as const;
type Body = { action?: "set_role" | "suspend" | "unsuspend"; role?: string; reason?: string };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
  const actor = await requireAdmin();
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Body;
  const reason = body.reason?.trim().slice(0, 300) ?? "";
  if (id === actor.id) return NextResponse.json({ error: "You can't change your own role or suspend yourself" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: target } = await db.from("profiles").select("org_name, full_name, role, suspended").eq("id", id).single();
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const label = `${target.full_name} · ${target.org_name}`;

  if (body.action === "set_role") {
    if (!ROLES.includes(body.role as (typeof ROLES)[number])) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    if (body.role === target.role) return NextResponse.json({ ok: true });
    const { error } = await db.from("profiles").update({ role: body.role }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAdminAction(actor, "user.role_changed", { type: "user", id, label }, { from: target.role, to: body.role, reason });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "suspend" || body.action === "unsuspend") {
    const suspend = body.action === "suspend";
    if (suspend && !reason) return NextResponse.json({ error: "A reason is required to suspend an account" }, { status: 400 });
    // Ban at the auth layer so existing sessions can't refresh, and flag the profile so RLS helpers ignore it.
    const { error: banError } = await db.auth.admin.updateUserById(id, { ban_duration: suspend ? "876000h" : "none" });
    if (banError) return NextResponse.json({ error: banError.message }, { status: 500 });
    const { error } = await db.from("profiles").update({ suspended: suspend }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Suspended users stay anonymous in the public log.
    await logAdminAction(actor, suspend ? "user.suspended" : "user.reinstated", { type: "user", id, label: "An account" }, { reason });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
