"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { GovernanceLog } from "@/components/GovernanceLog";
import { AlertIcon, CheckIcon, ClockIcon, DocIcon, SearchIcon, ShieldIcon } from "@/components/icons";
import { RequireAuth } from "@/components/RequireAuth";
import { Badge, StatCard } from "@/components/ui";
import { api, KYC_LABEL, ROLE_LABEL, useAuth, type KycStatus, type Role } from "@/lib/auth";
import { useContracts } from "@/lib/contracts";
import type { AdminOverview, AdminUser } from "@/lib/governance";
import { STATUS_LABEL, type ProjectStatus } from "@/lib/projects";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const short = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users & Roles" },
  { id: "chain", label: "On-chain Permissions" },
  { id: "log", label: "Governance Log" },
] as const;

export default function AdminPage() {
  return (
    <RequireAuth roles={["admin"]} reason="The admin dashboard is for LaoCarbon platform administrators.">
      <AdminDashboard />
    </RequireAuth>
  );
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Request failed (${res.status})`);
  return res.json();
}

function AdminDashboard() {
  const c = useContracts();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("overview");
  const overview = useQuery({ queryKey: ["admin-overview", c.chainId], queryFn: () => getJson<AdminOverview>(`/api/admin/overview?chainId=${c.chainId}`) });

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
      <p className="mt-1 text-muted">
        Manage accounts and oversee the registry. Every change you make here is published in the{" "}
        <Link href="/governance" className="font-medium text-brand underline">public Governance Log</Link>.
      </p>

      <div role="tablist" className="mt-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium ${tab === t.id ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {overview.error && <p className="mb-4 rounded-md bg-danger-soft p-3 text-sm text-danger">{overview.error.message}</p>}
        {tab === "overview" && <OverviewTab data={overview.data} />}
        {tab === "users" && <UsersTab />}
        {tab === "chain" && <ChainTab data={overview.data} />}
        {tab === "log" && <GovernanceLog />}
      </div>
    </div>
  );
}

function OverviewTab({ data: d }: { data?: AdminOverview }) {
  if (!d) return <div className="h-40 animate-pulse rounded-lg bg-white" />;
  const pendingReview = (d.projects.pending_review ?? 0) + (d.projects.changes_requested ?? 0);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Applications to review" value={pendingReview} unit="pending or awaiting changes" icon={<DocIcon className="h-5 w-5" />} />
        <StatCard label="KYC requests" value={d.users.kycPending} unit="organisations awaiting verification" icon={<ShieldIcon className="h-5 w-5" />} />
        <StatCard label="Accounts" value={d.users.total} unit={`${d.users.suspended} suspended`} icon={<CheckIcon className="h-5 w-5" />} />
        <StatCard label="Auditors" value={(d.users.byRole.auditor ?? 0) + (d.users.byRole.admin ?? 0)} unit={`incl. ${d.users.byRole.admin ?? 0} admin(s)`} icon={<ClockIcon className="h-5 w-5" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold">Platform finances (all time)</h2>
          <p className="mb-4 text-sm text-muted">Paid directly by the smart contract at each sale — the platform never holds buyers&apos; funds.</p>
          <dl className="space-y-2 text-sm">
            {[
              ["Total trading volume", d.finance.volume],
              ["Forest owners (87%)", d.finance.owners],
              ["Auditors (5%)", d.finance.auditors],
              ["LaoCarbon platform (5%)", d.finance.platform],
              ["Government of Lao PDR (3%)", d.finance.government],
            ].map(([k, v], i) => (
              <div key={k as string} className={`flex justify-between ${i === 0 ? "border-b border-line pb-2 font-semibold" : ""}`}>
                <dt className={i === 0 ? "" : "text-muted"}>{k as string}</dt>
                <dd className="tabular-nums">{usd.format(v as number)}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="card p-5">
          <h2 className="font-semibold">Project pipeline</h2>
          <p className="mb-4 text-sm text-muted">Submitted applications by status.</p>
          <ul className="space-y-2 text-sm">
            {(["pending_review", "changes_requested", "in_validation", "approved", "rejected"] as ProjectStatus[]).map((s) => (
              <li key={s} className="flex justify-between">
                <span className="text-muted">{STATUS_LABEL[s]}</span>
                <span className="font-semibold tabular-nums">{d.projects[s] ?? 0}</span>
              </li>
            ))}
          </ul>
          <Link href="/auditor" className="btn-secondary mt-4 w-full">Open auditor queue</Link>
        </section>
      </div>

      <section>
        <h2 className="mb-3 font-semibold">Latest governance activity</h2>
        <GovernanceLog limit={8} />
      </section>
    </div>
  );
}

const ROLES: Role[] = ["buyer", "forest_owner", "auditor", "admin"];

function UsersTab() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["admin-users"], queryFn: () => getJson<{ users: AdminUser[] }>("/api/admin/users") });
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [busy, setBusy] = useState<string>();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();

  const users = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.users ?? []).filter(
      (u) => (!roleFilter || u.role === roleFilter) && (!s || [u.email, u.fullName, u.orgName, u.wallet ?? ""].some((x) => x.toLowerCase().includes(s))),
    );
  }, [data, q, roleFilter]);

  async function act(u: AdminUser, body: Record<string, string>, confirmText: string) {
    let reason = "";
    if (body.action === "suspend") {
      reason = window.prompt(`Reason for suspending ${u.orgName}? (published without the organisation's name)`)?.trim() ?? "";
      if (!reason) return;
    } else if (!window.confirm(confirmText)) return;
    setBusy(u.id);
    setMsg(undefined);
    const r = await api(`/api/admin/users/${u.id}`, "POST", { ...body, reason });
    setBusy(undefined);
    setMsg(r.ok ? { ok: true, text: "Saved and recorded in the governance log." } : { ok: false, text: r.error });
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    queryClient.invalidateQueries({ queryKey: ["governance"] });
  }

  if (error) return <p className="rounded-md bg-danger-soft p-3 text-sm text-danger">{error.message}</p>;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[240px] flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search name, organisation, email or wallet…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input w-auto" aria-label="Role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </div>
      {msg && <p className={`mt-3 rounded-md p-3 text-sm ${msg.ok ? "bg-brand-soft text-brand" : "bg-danger-soft text-danger"}`}>{msg.text}</p>}
      <div className="card mt-3 overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-canvas text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Account</th>
              <th className="px-4 py-3 font-medium">Wallet</th>
              <th className="px-4 py-3 font-medium">KYC</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Last sign-in</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted">Loading accounts…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted">No accounts match.</td></tr>
            ) : (
              users.map((u) => {
                const self = u.id === me?.id;
                return (
                  <tr key={u.id} className={`border-t border-line ${u.suspended ? "bg-danger-soft/40" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{u.orgName} {u.suspended && <Badge tone="red">Suspended</Badge>} {self && <Badge>You</Badge>}</div>
                      <div className="text-xs text-muted">{u.fullName} · {u.email}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{u.wallet ? short(u.wallet) : <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-3">
                      <Badge tone={u.kycStatus === "verified" ? "green" : u.kycStatus === "pending" ? "amber" : u.kycStatus === "rejected" ? "red" : "gray"}>
                        {KYC_LABEL[u.kycStatus as KycStatus]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="input w-auto py-1 text-xs"
                        aria-label={`Role for ${u.orgName}`}
                        value={u.role}
                        disabled={self || busy === u.id}
                        onChange={(e) => act(u, { action: "set_role", role: e.target.value }, `Change ${u.orgName} from ${ROLE_LABEL[u.role as Role]} to ${ROLE_LABEL[e.target.value as Role]}? This is published in the governance log.`)}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{u.lastSignIn ? new Date(u.lastSignIn).toLocaleDateString("en-GB") : "Never"}</td>
                    <td className="px-4 py-3 text-right">
                      {!self && (
                        <button
                          className={`btn-secondary px-3 py-1.5 text-xs ${u.suspended ? "" : "text-danger"}`}
                          disabled={busy === u.id}
                          onClick={() => act(u, { action: u.suspended ? "unsuspend" : "suspend" }, `Reinstate ${u.orgName}?`)}
                        >
                          {u.suspended ? "Reinstate" : "Suspend"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">
        Website roles control which pages someone can use. Issuing credits on-chain additionally requires the wallet to hold
        REGISTRAR_ROLE / MINTER_ROLE in the contracts — see On-chain Permissions.
      </p>
    </div>
  );
}

function ChainTab({ data: d }: { data?: AdminOverview }) {
  if (!d) return <div className="h-40 animate-pulse rounded-lg bg-white" />;
  const single = d.roles.filter((r) => r.role === "DEFAULT_ADMIN_ROLE" && r.holders.length === 1);
  return (
    <div className="space-y-6">
      {single.length > 0 && (
        <div className="flex gap-3 rounded-md bg-warn-soft p-4 text-sm text-warn">
          <AlertIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Contract admin is a single wallet</p>
            <p className="mt-0.5">
              Before going live on a public chain, transfer DEFAULT_ADMIN_ROLE to a multi-signature wallet (e.g. Safe with 2-of-3:
              platform, Department of Forestry, community representative) and add a timelock for payout-wallet changes.
            </p>
          </div>
        </div>
      )}
      <section className="card overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-semibold">Role holders</h2>
          <p className="text-sm text-muted">Derived from RoleGranted / RoleRevoked events — this is what the contracts actually enforce.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-canvas text-left text-muted">
              <tr><th className="px-5 py-2.5 font-medium">Contract</th><th className="px-3 py-2.5 font-medium">Role</th><th className="px-5 py-2.5 font-medium">Holders</th></tr>
            </thead>
            <tbody>
              {d.roles.map((r) => (
                <tr key={`${r.contract}${r.role}`} className="border-t border-line">
                  <td className="px-5 py-2.5"><div className="font-medium">{r.contract}</div><div className="font-mono text-xs text-muted">{short(r.address)}</div></td>
                  <td className="px-3 py-2.5"><Badge>{r.role}</Badge></td>
                  <td className="px-5 py-2.5 font-mono text-xs">{r.holders.length ? r.holders.map((h) => <div key={h}>{h}</div>) : <span className="text-muted">none</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card p-5">
        <h2 className="font-semibold">Payout wallets</h2>
        <p className="mb-3 text-sm text-muted">Where the marketplace contract sends the platform and government shares.</p>
        {d.wallets ? (
          <dl className="space-y-2 text-sm">
            <Row k="Platform (5%)" v={<span className="font-mono text-xs">{d.wallets.platform}</span>} />
            <Row k="Government of Lao PDR (3%)" v={<span className="font-mono text-xs">{d.wallets.government}</span>} />
          </dl>
        ) : (
          <p className="text-sm text-muted">Couldn&apos;t read the contract on this network.</p>
        )}
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>;
}
