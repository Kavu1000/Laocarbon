#!/usr/bin/env node
// Creates a confirmed account with any role (auditors can't self-register).
// Usage: npm run create-user -- --email a@b.la --name "Full Name" --org "Org" [--role auditor]
// Prints a one-time random password; the user should change it from their Profile page.
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values: a } = parseArgs({
  options: { email: { type: "string" }, name: { type: "string" }, org: { type: "string" }, role: { type: "string", default: "auditor" } },
});
if (!a.email || !a.name || !a.org || !["buyer", "forest_owner", "auditor"].includes(a.role)) {
  console.error('Usage: npm run create-user -- --email a@b.la --name "Full Name" --org "Org" [--role auditor|buyer|forest_owner]');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in web/.env.local");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const password = randomBytes(12).toString("base64url");
const { data, error } = await admin.auth.admin.createUser({
  email: a.email.trim().toLowerCase(),
  password,
  email_confirm: true,
  user_metadata: { full_name: a.name, org_name: a.org },
});
if (error) {
  console.error(error.message);
  process.exit(1);
}
const { error: roleError } = await admin.from("profiles").update({ role: a.role }).eq("id", data.user.id);
if (roleError) {
  console.error(`User created but setting role failed: ${roleError.message}`);
  process.exit(1);
}
console.log(`Created ${a.role} account ${a.email}\nTemporary password: ${password}`);
