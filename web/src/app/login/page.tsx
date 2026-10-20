"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { AuthShell, FormError, PasswordField, TextField } from "@/components/AuthShell";
import { authErrorMessage, loadCurrentUser, safeNext, useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { user, setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>(
    params.get("error") === "confirm" ? "That confirmation link is invalid or has expired. Log in or register again." : undefined,
  );
  const [busy, setBusy] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resent, setResent] = useState<string>();

  useEffect(() => {
    if (user) router.replace(next);
  }, [user, next, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    setResent(undefined);
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setBusy(false);
      setUnconfirmed(/email not confirmed/i.test(error.message));
      setError(authErrorMessage(error.message));
      setPassword("");
      return;
    }
    setUser(await loadCurrentUser());
    router.replace(next);
  }

  async function resend() {
    const { error } = await supabase().auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setResent(error ? authErrorMessage(error.message) : `Sent — check ${email.trim()} (and your spam folder), then click the link.`);
  }

  return (
    <AuthShell title="Log in" subtitle="Welcome back. Log in to manage your projects, offsets and certificates.">
      <form method="post" onSubmit={submit} className="space-y-4" noValidate>
        <TextField id="email" label="Email address" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@organisation.la" />
        <PasswordField id="password" label="Password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <FormError>{error}</FormError>
        {unconfirmed && (
          <div className="text-sm">
            {resent ? (
              <p className="rounded-md bg-brand-soft p-3 text-brand">{resent}</p>
            ) : (
              <button type="button" className="font-medium text-brand underline" onClick={resend}>
                Resend confirmation email
              </button>
            )}
          </div>
        )}
        <button className="btn-primary w-full py-2.5" disabled={busy || !email || !password}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        New to LaoCarbon?{" "}
        <Link className="font-medium text-brand underline" href={`/signup${next !== "/profile" ? `?next=${encodeURIComponent(next)}` : ""}`}>
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
