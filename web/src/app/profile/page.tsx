"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Address } from "viem";
import { useAccount, useSignMessage } from "wagmi";
import { FormError, PasswordField, TextField } from "@/components/AuthShell";
import { Avatar } from "@/components/Avatar";
import { CertificateModal } from "@/components/CertificateModal";
import { CheckIcon, ClockIcon, FlameIcon, LeafIcon, ShieldIcon } from "@/components/icons";
import { Badge, StatCard } from "@/components/ui";
import { api, authErrorMessage, KYC_LABEL, ROLE_LABEL, useAuth, type User } from "@/lib/auth";
import { errMessage, fmtDate, fmtTons, fmtUsd, shortAddr } from "@/lib/format";
import { useOffsets, type Offset } from "@/lib/hooks";
import { STATUS_LABEL, STATUS_TONE, useMyProjects, usePublicProjects } from "@/lib/projects";
import { supabase } from "@/lib/supabase/client";

export default function ProfilePage() {
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login?next=/profile");
  }, [isLoading, user, router]);

  if (!user) return <div className="py-16 text-center text-muted">Loading profile…</div>;

  return (
    <div>
      <div className="card flex flex-wrap items-center gap-5 p-5 sm:p-6">
        <AvatarUpload user={user} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">{user.orgName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span>{user.fullName}</span>
            <span aria-hidden>·</span>
            <span>{user.email}</span>
            <Badge tone="green">{ROLE_LABEL[user.role]}</Badge>
            {user.kycStatus === "verified" && <Badge tone="green"><CheckIcon className="h-3 w-3" /> KYC verified</Badge>}
          </div>
          <div className="mt-1 text-xs text-muted">Member since {new Date(user.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</div>
        </div>
        <button
          className="btn-secondary"
          onClick={async () => {
            await logout();
            window.location.assign("/login");
          }}
        >
          Log out
        </button>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <ImpactSection user={user} />
          <AccountForm user={user} />
        </div>
        <div className="space-y-6">
          <KycCard user={user} />
          <WalletCard user={user} />
          <PasswordForm email={user.email} />
        </div>
      </div>
    </div>
  );
}

function AvatarUpload({ user }: { user: User }) {
  const { refresh } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function upload(file: File) {
    setError(undefined);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return setError("Use a PNG, JPG or WebP image");
    if (file.size > 2 * 1024 * 1024) return setError("Image must be under 2 MB");
    setBusy(true);
    const sb = supabase();
    const path = `${user.id}/avatar-${Date.now()}.${file.type.split("/")[1]}`;
    const { error: upErr } = await sb.storage.from("avatars").upload(path, file, { contentType: file.type });
    if (upErr) {
      setBusy(false);
      return setError(upErr.message);
    }
    const url = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    const { error: dbErr } = await sb.from("profiles").update({ avatar_url: url }).eq("id", user.id);
    setBusy(false);
    if (dbErr) return setError(dbErr.message);
    refresh();
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="group relative rounded-full focus-visible:outline-2 focus-visible:outline-brand"
        aria-label="Change logo"
        disabled={busy}
      >
        <Avatar user={user} size={64} />
        <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-[11px] font-medium text-white opacity-0 transition group-hover:opacity-100">
          {busy ? "Uploading…" : "Change"}
        </span>
      </button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      {error && <span className="max-w-[140px] text-center text-[11px] text-danger">{error}</span>}
    </div>
  );
}

function ImpactSection({ user }: { user: User }) {
  const { data: publicProjects = [] } = usePublicProjects();
  const { data: myProjects = [] } = useMyProjects(user.role === "forest_owner" ? user.id : undefined);
  const wallet = (user.wallet ?? undefined) as Address | undefined;
  const { data: offsets, isLoading } = useOffsets(wallet);
  const [viewing, setViewing] = useState<Offset>();
  const nameOf = (id: bigint | number) => publicProjects.find((p) => p.id === Number(id))?.name ?? `Project #${id}`;

  const list = wallet ? offsets ?? [] : [];
  const tons = list.reduce((s, o) => s + o.tons, 0n);
  const spent = list.reduce((s, o) => s + o.totalPaid, 0n);

  return (
    <section>
      <h2 className="text-lg font-semibold">Carbon Impact</h2>
      <p className="text-sm text-muted">On-chain retirement certificates held by your linked wallet — proof of your organisation's offsets.</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Credits Retired" value={fmtTons(tons)} unit="tCO₂e" icon={<FlameIcon className="h-5 w-5" />} />
        <StatCard label="Certificates" value={list.length} unit="soulbound tokens" icon={<ShieldIcon className="h-5 w-5" />} />
        <StatCard label="Invested" value={fmtUsd(spent)} unit="USDT in Lao forests" icon={<LeafIcon className="h-5 w-5" />} />
      </div>

      <div className="card mt-4 overflow-hidden">
        {!wallet ? (
          <p className="p-6 text-sm text-muted">Link a wallet to show your certificates here.</p>
        ) : isLoading ? (
          <p className="p-6 text-sm text-muted">Loading certificates…</p>
        ) : list.length === 0 ? (
          <p className="p-6 text-sm text-muted">
            No certificates yet. <Link href="/" className="font-medium text-brand underline">Buy & offset on the Marketplace</Link>.
          </p>
        ) : (
          <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
            {list.map((o) => (
              <li key={o.certificateId.toString()} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <ShieldIcon className="h-5 w-5 shrink-0 text-brand" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{fmtTons(o.tons)} tCO₂e · {nameOf(o.projectId)}</div>
                  <div className="text-xs text-muted">Certificate #{o.certificateId.toString()} · {fmtDate(o.timestamp)}</div>
                </div>
                <button className="btn-secondary px-3 py-1.5" onClick={() => setViewing(o)}>View</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {user.role === "forest_owner" && (
        <div className="card mt-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">My Projects</h3>
            <Link href="/register" className="btn-secondary px-3 py-1.5">Register project</Link>
          </div>
          {myProjects.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No projects submitted yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {myProjects.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <span className="truncate">{p.name || "Untitled draft"}</span>
                  <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {viewing && <CertificateModal offset={viewing} projectName={nameOf(viewing.projectId)} onClose={() => setViewing(undefined)} />}
    </section>
  );
}

function KycCard({ user }: { user: User }) {
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const tone = user.kycStatus === "verified" ? "green" : user.kycStatus === "rejected" ? "red" : user.kycStatus === "pending" ? "amber" : "gray";

  async function request() {
    setBusy(true);
    setError(undefined);
    const { error } = await supabase().rpc("request_kyc");
    setBusy(false);
    if (error) setError(error.message);
    else refresh();
  }

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Organisation Verification</h2>
        <Badge tone={tone}>{user.kycStatus === "pending" && <ClockIcon className="h-3 w-3" />}{KYC_LABEL[user.kycStatus]}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted">
        {user.kycStatus === "verified"
          ? "Your organisation has been verified by the LaoCarbon registry."
          : user.kycStatus === "pending"
            ? "A registry auditor is reviewing your organisation details."
            : "Verified organisations get a badge on their profile and certificates."}
      </p>
      <FormError>{error}</FormError>
      {(user.kycStatus === "not_submitted" || user.kycStatus === "rejected") && (
        <button className="btn-primary mt-3 w-full" disabled={busy} onClick={request}>
          {busy ? "Submitting…" : user.kycStatus === "rejected" ? "Request verification again" : "Request verification"}
        </button>
      )}
    </section>
  );
}

function WalletCard({ user }: { user: User }) {
  const { refresh } = useAuth();
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function link() {
    if (!address) return;
    setBusy(true);
    setError(undefined);
    try {
      const n = await api<{ message: string }>(`/api/profile/wallet?address=${address}`, "GET");
      if (!n.ok) throw new Error(n.error);
      const signature = await signMessageAsync({ message: n.data.message });
      const r = await api("/api/profile/wallet", "POST", { address, signature });
      if (!r.ok) throw new Error(r.error);
      refresh();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    const r = await api("/api/profile/wallet", "DELETE");
    setBusy(false);
    if (r.ok) refresh();
    else setError(r.error);
  }

  const differs = user.wallet && address && user.wallet.toLowerCase() !== address.toLowerCase();

  return (
    <section className="card p-5">
      <h2 className="font-semibold">Linked Wallet</h2>
      <p className="mt-1 text-sm text-muted">Certificates and sale proceeds are tied to this wallet.</p>
      {user.wallet ? (
        <div className="mt-3 rounded-md bg-brand-soft p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-brand"><CheckIcon className="h-4 w-4" /> Verified by signature</div>
          <div className="mt-1 break-all font-mono text-xs">{user.wallet}</div>
        </div>
      ) : (
        <p className="mt-3 rounded-md bg-canvas p-3 text-sm text-muted">No wallet linked yet.</p>
      )}
      {differs && <p className="mt-2 text-xs text-warn">Your connected wallet ({shortAddr(address)}) is different from the linked one.</p>}
      <FormError>{error}</FormError>
      <div className="mt-3 flex flex-wrap gap-2">
        {!isConnected ? (
          !user.wallet && <button className="btn-primary" onClick={openConnectModal}>Connect wallet</button>
        ) : !user.wallet || differs ? (
          <button className="btn-primary" disabled={busy} onClick={link}>
            {busy ? "Waiting for signature…" : `Link ${shortAddr(address)}`}
          </button>
        ) : null}
        {user.wallet && <button className="btn-secondary" disabled={busy} onClick={unlink}>Unlink</button>}
      </div>
      <p className="mt-2 text-xs text-muted">Linking asks you to sign a message. It's free and sends no transaction.</p>
    </section>
  );
}

function AccountForm({ user }: { user: User }) {
  const { refresh } = useAuth();
  const [f, setF] = useState({ fullName: user.fullName, orgName: user.orgName, phone: user.phone, website: user.website, bio: user.bio });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    setF((x) => ({ ...x, [k]: e.target.value }));
    setErrors((x) => ({ ...x, [k]: "" }));
    setSaved(false);
  };
  const dirty = (Object.keys(f) as (keyof typeof f)[]).some((k) => f[k] !== user[k]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v = { fullName: f.fullName.trim(), orgName: f.orgName.trim(), phone: f.phone.trim(), website: f.website.trim(), bio: f.bio.trim() };
    const local: Record<string, string> = {};
    if (!v.fullName) local.fullName = "Enter your full name";
    if (!v.orgName) local.orgName = "Enter your organisation name";
    if (v.website && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(v.website)) local.website = "Must start with http:// or https://";
    setErrors(local);
    if (Object.keys(local).length) return;

    setBusy(true);
    setError(undefined);
    const { error } = await supabase()
      .from("profiles")
      .update({ full_name: v.fullName, org_name: v.orgName, phone: v.phone, website: v.website, bio: v.bio })
      .eq("id", user.id);
    setBusy(false);
    if (error) return setError(error.message);
    refresh();
    setSaved(true);
  }

  return (
    <section className="card p-5">
      <h2 className="font-semibold">Organisation Details</h2>
      <form method="post" onSubmit={submit} className="mt-4 space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="p-org" label="Organisation" value={f.orgName} onChange={set("orgName")} error={errors.orgName} maxLength={150} />
          <TextField id="p-name" label="Contact name" value={f.fullName} onChange={set("fullName")} error={errors.fullName} maxLength={100} />
          <TextField id="p-email" label="Email" value={user.email} disabled hint="Contact support to change your email." />
          <TextField id="p-phone" label="Phone" type="tel" value={f.phone} onChange={set("phone")} maxLength={40} />
        </div>
        <TextField id="p-web" label="Website" type="url" placeholder="https://" value={f.website} onChange={set("website")} error={errors.website} />
        <div>
          <label className="label" htmlFor="p-bio">About</label>
          <textarea id="p-bio" className="input min-h-24" maxLength={1000} value={f.bio} onChange={set("bio")} placeholder="Tell buyers and partners about your organisation's sustainability goals…" />
        </div>
        <FormError>{error}</FormError>
        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-sm text-brand">Saved</span>}
          <button className="btn-primary" disabled={busy || !dirty}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </section>
  );
}

function PasswordForm({ email }: { email: string }) {
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    setError(undefined);
    const local: Record<string, string> = {};
    if (pw.length < 8) local.newPassword = "Use at least 8 characters";
    else if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) local.newPassword = "Include at least one letter and one number";
    if (pw !== confirm) local.confirm = "Passwords don't match";
    setErrors(local);
    if (Object.keys(local).length) return;

    setBusy(true);
    const sb = supabase();
    // Re-authenticate so a hijacked open session can't silently change the password.
    const { error: authErr } = await sb.auth.signInWithPassword({ email, password: cur });
    if (authErr) {
      setBusy(false);
      setErrors({ currentPassword: authErrorMessage(authErr.message) === "Incorrect email or password" ? "Incorrect password" : authErrorMessage(authErr.message) });
      return;
    }
    const { error: updErr } = await sb.auth.updateUser({ password: pw });
    if (!updErr) await sb.auth.signOut({ scope: "others" });
    setBusy(false);
    if (updErr) return setError(authErrorMessage(updErr.message));
    setCur(""); setPw(""); setConfirm("");
    setDone(true);
  }

  return (
    <section className="card p-5">
      <h2 className="font-semibold">Change Password</h2>
      <form method="post" onSubmit={submit} className="mt-4 space-y-3" noValidate>
        <PasswordField id="cur" label="Current password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} error={errors.currentPassword} />
        <PasswordField id="new" label="New password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} error={errors.newPassword} hint="At least 8 characters with a letter and a number." />
        <PasswordField id="confirm" label="Confirm new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
        <FormError>{error}</FormError>
        {done && <p className="rounded-md bg-brand-soft p-3 text-sm text-brand">Password updated. Other devices have been signed out.</p>}
        <button className="btn-primary w-full" disabled={busy || !cur || !pw || !confirm}>{busy ? "Updating…" : "Update password"}</button>
      </form>
    </section>
  );
}
