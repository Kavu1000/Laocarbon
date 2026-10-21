"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { BarList } from "@/components/charts/BarList";
import { SplitBar } from "@/components/charts/SplitBar";
import { TrendChart } from "@/components/charts/TrendChart";
import { AlertIcon, CheckIcon, ClockIcon, DocIcon, FlameIcon, LeafIcon, ShieldIcon } from "@/components/icons";
import { Badge, Empty } from "@/components/ui";
import { WalletAvatar } from "@/components/WalletAvatar";
import { useContracts } from "@/lib/contracts";
import { RANGES, type DashboardData, type Kpi, type Range, type VerificationLevel } from "@/lib/dashboard";
import { PROJECT_TYPES, PROVINCES } from "@/lib/projects";

const OverviewMap = dynamic(() => import("@/components/map/OverviewMap").then((m) => m.OverviewMap), {
  ssr: false,
  loading: () => <div className="h-[380px] animate-pulse rounded-lg bg-canvas" />,
});

const n0 = new Intl.NumberFormat("en-US");
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const short = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function DashboardPage() {
  const c = useContracts();
  const [range, setRange] = useState<Range>("all");
  const [province, setProvince] = useState("");
  const [type, setType] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard", c.chainId, range, province, type],
    queryFn: async (): Promise<DashboardData> => {
      const q = new URLSearchParams({ chainId: String(c.chainId), range, ...(province && { province }), ...(type && { type }) });
      const res = await fetch(`/api/dashboard?${q}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Dashboard unavailable (${res.status})`);
      return res.json();
    },
    placeholderData: (prev) => prev,
    refetchInterval: 30_000,
  });

  const periodLabel = range === "all" ? "All time" : `Last ${RANGES.find((r) => r.id === range)!.label}`;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Impact Dashboard</h1>
          <p className="mt-1 text-muted">
            Live, read-only view of LaoCarbon. Every figure comes from on-chain records and public verification data.{" "}
            <Link href="/governance" className="font-medium text-brand underline">See who approved what →</Link>
          </p>
        </div>
        {data && <span className="text-xs text-muted">Updated {when(data.generatedAt)}</span>}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-line bg-white text-sm" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r.id} onClick={() => setRange(r.id)} aria-pressed={range === r.id} className={`px-3 py-1.5 ${range === r.id ? "bg-brand text-white" : "hover:bg-canvas"}`}>
              {r.label}
            </button>
          ))}
        </div>
        <select className="input w-auto" aria-label="Province" value={province} onChange={(e) => setProvince(e.target.value)}>
          <option value="">All provinces</option>
          {PROVINCES.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select className="input w-auto" aria-label="Project type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All project types</option>
          {PROJECT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        {(province || type || range !== "all") && (
          <button className="text-sm text-brand underline" onClick={() => { setRange("all"); setProvince(""); setType(""); }}>Reset</button>
        )}
      </div>

      {error ? (
        <div className="mt-6"><Empty title="Dashboard unavailable">{error.message}</Empty></div>
      ) : isLoading || !data ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="h-28 animate-pulse rounded-lg bg-white" />)}</div>
      ) : (
        <Body data={data} periodLabel={periodLabel} />
      )}
    </div>
  );
}

function Body({ data: d, periodLabel }: { data: DashboardData; periodLabel: string }) {
  const k = d.kpis;
  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile icon={<FlameIcon className="h-5 w-5" />} label="tCO₂e retired" kpi={k.retiredTons} fmt={(v) => n0.format(v)} />
        <Tile icon={<span className="font-semibold">$</span>} label="Trading volume" kpi={k.volumeUsd} fmt={(v) => usd0.format(v)} />
        <Tile icon={<LeafIcon className="h-5 w-5" />} label="Paid to forest owners (87%)" kpi={k.ownersUsd} fmt={(v) => usd0.format(v)} />
        <Tile icon={<ShieldIcon className="h-5 w-5" />} label="Paid to Gov. of Lao PDR (3%)" kpi={k.governmentUsd} fmt={(v) => usd0.format(v)} />
        <Tile icon={<CheckIcon className="h-5 w-5" />} label="Verified projects" value={n0.format(k.verifiedProjects)} sub="approved by registry auditors" />
        <Tile icon={<LeafIcon className="h-5 w-5" />} label="Forest under protection" value={`${n0.format(k.protectedHa)} ha`} sub="mapped project boundaries" />
        <Tile icon={<DocIcon className="h-5 w-5" />} label="Buyer organisations" kpi={k.buyers} fmt={(v) => n0.format(v)} />
        <Tile icon={<ClockIcon className="h-5 w-5" />} label="Credits still available" value={`${n0.format(k.availableTons)}`} sub="tCO₂e listed for sale" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Panel title="Retirements over time" sub={`Credits bought & burned, per ${d.bucket}`}>
          <TrendChart data={d.series} bucket={d.bucket} />
        </Panel>
        <Panel title="Where the money goes" sub={`Split of ${usd0.format(k.volumeUsd.value)} in sales, enforced by the smart contract`}>
          <SplitBar
            parts={[
              { label: "Forest owners & communities", value: d.split.owners, note: "87% — paid instantly to the seller's wallet" },
              { label: "Independent auditors", value: d.split.auditors, note: "5% — to the project's auditor of record" },
              { label: "LaoCarbon platform", value: d.split.platform, note: "5% — operations" },
              { label: "Government of Lao PDR", value: d.split.government, note: "3% — national forestry fund" },
            ]}
          />
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Panel title="Projects across Lao PDR" sub="Click a circle to open the project">
          <OverviewMap projects={d.map} />
        </Panel>
        <Panel title="Verification health" sub={`${d.health.listed} listed projects`}>
          <ul className="space-y-3 text-sm">
            <Health label="Documents reviewed" n={d.health.documentReviewed} of={d.health.listed} />
            <Health label="Satellite verified" n={d.health.satelliteVerified} of={d.health.listed} />
            <Health label="Field visit completed" n={d.health.fieldVisited} of={d.health.listed} />
          </ul>
          <div className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
            <p className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5"><AlertIcon className="h-4 w-4 text-danger" /> Flagged by auditors</span>
              <span className="font-semibold">{d.health.flagged}</span>
            </p>
            <p className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5"><ClockIcon className="h-4 w-4 text-warn" /> Not re-verified in 6 months</span>
              <span className="font-semibold">{d.health.stale}</span>
            </p>
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Retired by project type" sub={periodLabel}><BarList items={d.byType} /></Panel>
        <Panel title="Retired by province" sub="Where offset demand is going"><BarList items={d.byProvince} /></Panel>
      </div>

      <Panel title="Projects" sub="Ranked by credits retired (all time)">
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-canvas text-left text-muted">
              <tr>
                <th className="px-5 py-2.5 font-medium">Project</th>
                <th className="px-3 py-2.5 font-medium">Province</th>
                <th className="px-3 py-2.5 text-right font-medium">Retired</th>
                <th className="px-3 py-2.5 font-medium">Sold</th>
                <th className="px-3 py-2.5 text-right font-medium">Price</th>
                <th className="px-5 py-2.5 font-medium">Verification</th>
              </tr>
            </thead>
            <tbody>
              {d.projects.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-5 py-2.5"><Link href={`/projects/${p.id}`} className="font-medium hover:underline">{p.name}</Link></td>
                  <td className="px-3 py-2.5 text-muted">{p.province}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{n0.format(p.retired)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-[#2e8b57]" style={{ width: `${p.soldPct}%` }} /></div>
                      <span className="tabular-nums text-muted">{p.soldPct}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{p.price !== null ? usd2.format(p.price) : "—"}</td>
                  <td className="px-5 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      <Level label="Docs" v={p.verification.document} />
                      <Level label="Satellite" v={p.verification.satellite} />
                      <Level label="Field" v={p.verification.field} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Top offsetting organisations" sub={`${periodLabel} · wallets not linked to an account stay anonymous`}>
          {d.leaderboard.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No retirements in this period</p>
          ) : (
            <ol className="space-y-2.5">
              {d.leaderboard.map((b, i) => (
                <li key={b.wallet} className="flex items-center gap-3 text-sm">
                  <span className="w-5 text-right text-xs font-semibold text-muted">{i + 1}</span>
                  <WalletAvatar wallet={b.wallet} name={b.name} avatarUrl={b.avatarUrl} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate font-medium">
                      {b.name ?? `Anonymous ${short(b.wallet)}`}
                      {b.verified && <CheckIcon className="h-3.5 w-3.5 shrink-0 text-brand" aria-label="KYC verified" />}
                    </span>
                    <span className="text-xs text-muted">{b.certificates} certificate{b.certificates > 1 ? "s" : ""}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{n0.format(b.tons)} <span className="font-normal text-muted">tCO₂e</span></span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
        <Panel title="Recent activity" sub="Latest retirements on-chain">
          {d.recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No retirements in this period</p>
          ) : (
            <ul className="divide-y divide-line">
              {d.recent.map((r) => (
                <li key={r.certificateId} className="flex items-start gap-3 py-2.5 text-sm">
                  <FlameIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{r.buyerName ?? short(r.buyer)}</span>{" "}
                    {r.direct ? "burned" : "offset"} <span className="font-medium tabular-nums">{n0.format(r.tons)} tCO₂e</span> from{" "}
                    <Link href={`/projects/${r.projectId}`} className="hover:underline">{r.projectName}</Link>
                    <span className="block text-xs text-muted">
                      {when(r.time)} · Certificate #{r.certificateId}{r.usd > 0 && ` · ${usd0.format(r.usd)}`} · <span className="font-mono" title={r.txHash}>tx {r.txHash.slice(0, 10)}…</span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="font-semibold">{title}</h2>
      {sub && <p className="mb-4 text-sm text-muted">{sub}</p>}
      {children}
    </section>
  );
}

function Tile({ icon, label, kpi, fmt, value, sub }: { icon: ReactNode; label: string; kpi?: Kpi; fmt?: (v: number) => string; value?: string; sub?: string }) {
  let delta: ReactNode = sub ? <span className="text-xs text-muted">{sub}</span> : null;
  if (kpi && kpi.previous !== null) {
    const diff = kpi.value - kpi.previous;
    const pct = kpi.previous > 0 ? Math.round((diff / kpi.previous) * 100) : null;
    delta = (
      <span className={`text-xs font-medium ${diff > 0 ? "text-brand" : diff < 0 ? "text-danger" : "text-muted"}`}>
        {diff > 0 ? "▲" : diff < 0 ? "▼" : "–"} {pct === null ? (diff > 0 ? "new this period" : "no change") : `${Math.abs(pct)}% vs previous period`}
      </span>
    );
  } else if (kpi) delta = <span className="text-xs text-muted">all time</span>;
  return (
    <div className="card flex items-start gap-4 p-4">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-brand-soft text-brand">{icon}</div>
      <div className="min-w-0">
        <div className="text-sm text-muted">{label}</div>
        <div className="truncate text-2xl font-semibold">{kpi && fmt ? fmt(kpi.value) : value}</div>
        {delta}
      </div>
    </div>
  );
}

function Health({ label, n, of }: { label: string; n: number; of: number }) {
  const pct = of ? Math.round((n / of) * 100) : 0;
  return (
    <li>
      <div className="flex justify-between"><span>{label}</span><span className="font-semibold tabular-nums">{n}/{of}</span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-[#2e8b57]" style={{ width: `${pct}%` }} /></div>
    </li>
  );
}

const LEVEL: Record<Exclude<VerificationLevel, null>, { tone: "green" | "amber" | "red"; icon: string }> = {
  passed: { tone: "green", icon: "✓" },
  flagged: { tone: "amber", icon: "!" },
  failed: { tone: "red", icon: "✕" },
};

function Level({ label, v }: { label: string; v: VerificationLevel }) {
  return v ? <Badge tone={LEVEL[v].tone}>{LEVEL[v].icon} {label}</Badge> : <Badge>– {label}</Badge>;
}
