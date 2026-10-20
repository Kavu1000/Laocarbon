import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getAddress, isAddress, verifyMessage } from "viem";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

// profiles.wallet isn't user-writable (column grants), so linking goes through this route,
// which proves wallet ownership with a signed one-time nonce before writing via the admin client.

const NONCE_TTL_MS = 10 * 60_000;
const err = (error: string, status = 400) => NextResponse.json({ error }, { status });
const linkMessage = (email: string, address: string, nonce: string) =>
  `LaoCarbon: link this wallet to my account.\n\nAccount: ${email}\nWallet: ${address}\nNonce: ${nonce}`;

async function sessionUser() {
  const { data } = await (await supabaseServer()).auth.getUser();
  return data.user;
}

function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || new URL(origin).host === req.headers.get("host");
}

/** Step 1: issue a nonce for the wallet to sign. */
export async function GET(req: Request) {
  const user = await sessionUser();
  if (!user) return err("Not signed in", 401);
  const address = new URL(req.url).searchParams.get("address") ?? "";
  if (!isAddress(address)) return err("Invalid address");

  const nonce = randomBytes(16).toString("hex");
  const { error } = await supabaseAdmin()
    .from("wallet_link_nonces")
    .upsert({ user_id: user.id, nonce, expires_at: new Date(Date.now() + NONCE_TTL_MS).toISOString() });
  if (error) return err("Could not start wallet linking", 500);
  return NextResponse.json({ message: linkMessage(user.email ?? "", getAddress(address), nonce) });
}

/** Step 2: verify the signature, then link. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return err("Cross-site request blocked", 403);
  if (!req.headers.get("content-type")?.includes("application/json")) return err("Expected JSON", 415);
  const user = await sessionUser();
  if (!user) return err("Not signed in", 401);
  const body = (await req.json().catch(() => ({}))) as { address?: string; signature?: `0x${string}` };
  if (!body.address || !isAddress(body.address) || !body.signature) return err("Missing address or signature");

  const admin = supabaseAdmin();
  const { data: row } = await admin.from("wallet_link_nonces").select("nonce, expires_at").eq("user_id", user.id).maybeSingle();
  await admin.from("wallet_link_nonces").delete().eq("user_id", user.id);
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return err("Signature request expired — try again");

  const address = getAddress(body.address);
  const valid = await verifyMessage({ address, message: linkMessage(user.email ?? "", address, row.nonce), signature: body.signature }).catch(() => false);
  if (!valid) return err("Signature does not match this wallet");

  const { error } = await admin.from("profiles").update({ wallet: address }).eq("id", user.id);
  if (error) return err(error.code === "23505" ? "This wallet is already linked to another account" : "Could not link wallet", error.code === "23505" ? 409 : 500);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return err("Cross-site request blocked", 403);
  const user = await sessionUser();
  if (!user) return err("Not signed in", 401);
  const { error } = await supabaseAdmin().from("profiles").update({ wallet: null }).eq("id", user.id);
  if (error) return err("Could not unlink wallet", 500);
  return NextResponse.json({ ok: true });
}
