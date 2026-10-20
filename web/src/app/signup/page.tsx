"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { AuthShell, FormError, PasswordField, TextField } from "@/components/AuthShell";
import { authErrorMessage, loadCurrentUser, safeNext, useAuth, type Role } from "@/lib/auth";
import { supabase } from "@/lib/supabase/client";

const ROLE_OPTIONS: { value: Role; title: string; text: string }[] = [
  { value: "buyer", title: "Buyer organisation", text: "Buy & offset credits and receive retirement certificates." },
  { value: "forest_owner", title: "Forest owner / Developer", text: "Register projects, list credits and receive 87% of each sale." },
];

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { user, setUser } = useAuth();
  const [f, setF] = useState({
    fullName: "", orgName: "", email: "", phone: "", password: "", confirm: "",
    role: (params.get("role") === "forest_owner" ? "forest_owner" : "buyer") as Role,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string>();

  useEffect(() => {
    if (user) router.replace(next);
  }, [user, next, router]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    setF((x) => ({ ...x, [k]: e.target.value }));
    setErrors((x) => ({ ...x, [k]: "" }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!f.fullName.trim()) local.fullName = "Enter your full name";
    if (!f.orgName.trim()) local.orgName = "Enter your organisation name";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) local.email = "Enter a valid email address";
    if (f.password.length < 8) local.password = "Use at least 8 characters";
    else if (!/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) local.password = "Include at least one letter and one number";
    if (f.confirm !== f.password) local.confirm = "Passwords don't match";
    setErrors(local);
    if (Object.keys(local).length) return;

    setBusy(true);
    setError(undefined);
    const { data, error } = await supabase().auth.signUp({
      email: f.email.trim(),
      password: f.password,
      options: {
        data: { full_name: f.fullName.trim(), org_name: f.orgName.trim(), role: f.role, phone: f.phone.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(false);
    if (error) {
      const msg = authErrorMessage(error.message);
      setError(msg);
      if (/already exists/.test(msg)) setErrors({ email: "Already registered — log in instead" });
      return;
    }
    // With email confirmation enabled Supabase returns no session until the link is clicked.
    if (!data.session) {
      setSentTo(f.email.trim());
      return;
    }
    setUser(await loadCurrentUser());
    router.replace(next);
  }

  if (sentTo) {
    return (
      <AuthShell title="Check your email" subtitle="One more step to activate your account.">
        <p className="text-sm">
          We sent a confirmation link to <strong>{sentTo}</strong>. Open it on this device to finish creating your account.
        </p>
        <p className="mt-3 text-sm text-muted">Didn't get it? Check your spam folder, or wait a minute and register again.</p>
        <Link className="btn-secondary mt-6 w-full" href="/login">Back to log in</Link>
      </AuthShell>
    );
  }

  const s = strength(f.password);

  return (
    <AuthShell title="Register" subtitle="Create your organisation's LaoCarbon account.">
      <form method="post" onSubmit={submit} className="space-y-4" noValidate>
        <fieldset>
          <legend className="label">Account type</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ROLE_OPTIONS.map((o) => (
              <label key={o.value} className={`cursor-pointer rounded-md border p-3 ${f.role === o.value ? "border-brand bg-brand-soft/50 ring-1 ring-brand" : "border-line hover:bg-canvas"}`}>
                <input type="radio" name="role" className="sr-only" checked={f.role === o.value} onChange={() => setF((x) => ({ ...x, role: o.value }))} />
                <span className="block text-sm font-semibold">{o.title}</span>
                <span className="mt-0.5 block text-xs text-muted">{o.text}</span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">Auditor accounts are issued by the LaoCarbon registry.</p>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="fullName" label="Full name" autoComplete="name" value={f.fullName} onChange={set("fullName")} error={errors.fullName} />
          <TextField id="orgName" label="Organisation" autoComplete="organization" value={f.orgName} onChange={set("orgName")} error={errors.orgName} />
        </div>
        <TextField id="email" label="Work email" type="email" autoComplete="email" value={f.email} onChange={set("email")} error={errors.email} placeholder="you@organisation.la" />
        <TextField id="phone" label="Phone (optional)" type="tel" autoComplete="tel" value={f.phone} onChange={set("phone")} placeholder="+856 20 5555 0000" />
        <div>
          <PasswordField id="password" label="Password" autoComplete="new-password" value={f.password} onChange={set("password")} error={errors.password} hint="At least 8 characters with a letter and a number." />
          {f.password && (
            <div className="mt-2 flex gap-1" aria-label={`Password strength ${s} of 4`}>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`h-1 flex-1 rounded-full ${i < s ? (s <= 1 ? "bg-danger" : s === 2 ? "bg-warn" : "bg-brand") : "bg-line"}`} />
              ))}
            </div>
          )}
        </div>
        <PasswordField id="confirm" label="Confirm password" autoComplete="new-password" value={f.confirm} onChange={set("confirm")} error={errors.confirm} />
        <FormError>{error}</FormError>
        <button className="btn-primary w-full py-2.5" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link className="font-medium text-brand underline" href={`/login${next !== "/profile" ? `?next=${encodeURIComponent(next)}` : ""}`}>
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
