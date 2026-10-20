"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatUnits } from "viem";
import { BuyOffsetModal } from "@/components/BuyOffsetModal";
import { CheckIcon, ClockIcon, DocIcon, FlameIcon, LeafIcon, PinIcon, SearchIcon } from "@/components/icons";
import { Badge, Empty, ForestArt, StatCard } from "@/components/ui";
import { USDT_DECIMALS } from "@/lib/contracts";
import { fmtTons, fmtUsd } from "@/lib/format";
import { useListings, useParticipants, useRegisteredProjects, useRetiredTotal, type Listing } from "@/lib/hooks";
import type { Participant, ParticipantsResponse } from "@/lib/participants";
import { WalletAvatar } from "@/components/WalletAvatar";
import { PROJECT_TYPES, PROVINCES, usePublicProjects, type PublicProject } from "@/lib/projects";

type Card = { key: string; project?: PublicProject; projectId: number; listing?: Listing; verified: boolean };
type Sort = "newest" | "price-asc" | "price-desc" | "available";

export default function MarketplacePage() {
  const { data: projects = [] } = usePublicProjects();
  const { listings, isLoading, ready } = useListings();
  const { data: registered } = useRegisteredProjects();
  const retired = useRetiredTotal();
  const { data: participants } = useParticipants();

  const [query, setQuery] = useState("");
  const [province, setProvince] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [creditsMin, setCreditsMin] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [buying, setBuying] = useState<Card>();

  const cards = useMemo(() => {
    const byId = new Map(projects.map((p) => [p.id, p]));
    const listed: Card[] = listings
      .filter((l) => l.available > 0n)
      .map((l) => ({
        key: `l${l.listingId}`,
        projectId: Number(l.projectId),
        project: byId.get(Number(l.projectId)),
        listing: l,
        verified: registered?.has(Number(l.projectId)) ?? true,
      }));
    const listedIds = new Set(listed.map((c) => c.projectId));
    const inValidation: Card[] = projects
      .filter((p) => p.status === "in_validation" && !listedIds.has(p.id))
      .map((p) => ({ key: `p${p.id}`, projectId: p.id, project: p, verified: false }));
    return [...listed, ...inValidation];
  }, [projects, listings, registered]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = priceMin ? Number(priceMin) : undefined;
    const max = priceMax ? Number(priceMax) : undefined;
    const cmin = creditsMin ? Number(creditsMin) : undefined;
    const price = (c: Card) => (c.listing ? Number(formatUnits(c.listing.pricePerTon, USDT_DECIMALS)) : undefined);
    const avail = (c: Card) => (c.listing ? Number(c.listing.available) : 0);
    return cards
      .filter((c) => {
        const p = c.project;
        if (q && ![p?.name, p?.province, p?.company, p?.description].some((s) => s?.toLowerCase().includes(q))) return false;
        if (province && p?.province !== province) return false;
        if (types.length && (!p || !types.includes(p.type))) return false;
        if (statuses.length && !statuses.includes(c.verified ? "Verified" : "In Validation")) return false;
        const pr = price(c);
        if (min !== undefined && (pr === undefined || pr < min)) return false;
        if (max !== undefined && (pr === undefined || pr > max)) return false;
        if (cmin !== undefined && avail(c) < cmin) return false;
        return true;
      })
      .sort((a, b) => {
        if (sort === "price-asc") return (price(a) ?? Infinity) - (price(b) ?? Infinity);
        if (sort === "price-desc") return (price(b) ?? -1) - (price(a) ?? -1);
        if (sort === "available") return avail(b) - avail(a);
        return b.projectId - a.projectId;
      });
  }, [cards, query, province, types, statuses, priceMin, priceMax, creditsMin, sort]);

  const live = cards.filter((c) => c.listing);
  const totalAvailable = live.reduce((s, c) => s + c.listing!.available, 0n);
  const avgPrice = live.length ? live.reduce((s, c) => s + c.listing!.pricePerTon, 0n) / BigInt(live.length) : 0n;

  const chips = [
    ...statuses.map((s) => ({ label: s, clear: () => setStatuses((x) => x.filter((y) => y !== s)) })),
    ...types.map((t) => ({ label: t.split(" (")[0], clear: () => setTypes((x) => x.filter((y) => y !== t)) })),
    ...(province ? [{ label: province, clear: () => setProvince("") }] : []),
  ];
  const clearAll = () => {
    setQuery(""); setProvince(""); setTypes([]); setStatuses([]); setPriceMin(""); setPriceMax(""); setCreditsMin("");
  };
  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
        <h2 className="text-lg font-semibold">Filters</h2>
        <div>
          <label className="label" htmlFor="province">Province</label>
          <select id="province" className="input" value={province} onChange={(e) => setProvince(e.target.value)}>
            <option value="">Lao PDR (All)</option>
            {PROVINCES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <fieldset>
          <legend className="label">Project Type</legend>
          {PROJECT_TYPES.map((t) => (
            <Check key={t} label={t} checked={types.includes(t)} onChange={() => toggle(types, setTypes, t)} />
          ))}
        </fieldset>
        <fieldset>
          <legend className="label">Verification Status</legend>
          {["Verified", "In Validation"].map((s) => (
            <Check key={s} label={s} checked={statuses.includes(s)} onChange={() => toggle(statuses, setStatuses, s)} />
          ))}
        </fieldset>
        <fieldset>
          <legend className="label">Price Range (USD / tCO₂e)</legend>
          <div className="flex items-center gap-2">
            <input className="input" inputMode="decimal" placeholder="Min" aria-label="Minimum price" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} />
            <span className="text-muted">–</span>
            <input className="input" inputMode="decimal" placeholder="Max" aria-label="Maximum price" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} />
          </div>
        </fieldset>
        <div>
          <label className="label" htmlFor="cmin">Minimum available (tCO₂e)</label>
          <input id="cmin" className="input" inputMode="numeric" placeholder="e.g. 50000" value={creditsMin} onChange={(e) => setCreditsMin(e.target.value)} />
        </div>
        <button className="btn-secondary w-full" onClick={clearAll}>Clear All Filters</button>
      </aside>

      <section className="min-w-0">
        <h1 className="text-3xl font-bold tracking-tight">Marketplace</h1>
        <p className="mt-1 text-muted">Discover and offset with high-impact forestry carbon projects from across Lao PDR.</p>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Projects" value={cards.length} unit="Forestry projects listed" icon={<DocIcon className="h-5 w-5" />} />
          <StatCard label="Available Credits" value={fmtTons(totalAvailable)} unit="tCO₂e" icon={<LeafIcon className="h-5 w-5" />} />
          <StatCard label="Avg Price" value={fmtUsd(avgPrice)} unit="per tCO₂e" icon={<span className="text-lg font-semibold">$</span>} />
          <StatCard label="Retired Credits" value={fmtTons(retired)} unit="tCO₂e burned on-chain" icon={<FlameIcon className="h-5 w-5" />} />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input pl-9" placeholder="Search projects, locations, or developers…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {chips.map((c) => (
            <button key={c.label} onClick={c.clear} className="rounded-full border border-line bg-white px-3 py-1 text-sm hover:bg-canvas">
              {c.label} <span aria-hidden className="ml-1 text-muted">×</span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-sm text-muted">{filtered.length} projects found</span>
          <label className="flex items-center gap-2 text-sm text-muted">
            Sort by
            <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="newest">Newest First</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="available">Most Available</option>
            </select>
          </label>
        </div>

        <div className="mt-4">
          {!ready ? (
            <Empty title="Contracts not found on this network">
              Deploy with Hardhat Ignition and run <code>npx hardhat run scripts/export-web.ts</code>, or switch your wallet to a supported network.
            </Empty>
          ) : isLoading ? (
            <Empty title="Loading listings from the chain…" />
          ) : filtered.length === 0 ? (
            <Empty title="No projects match your filters">Try clearing some filters.</Empty>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4 xl:grid-cols-3">
              {filtered.map((c) => (
                <ProjectCard key={c.key} card={c} people={participants} onBuy={() => setBuying(c)} />
              ))}
            </div>
          )}
        </div>
      </section>

      {buying?.listing && <BuyOffsetModal listing={buying.listing} projectName={buying.project?.name} onClose={() => setBuying(undefined)} />}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-brand" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}

function StatusBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <Badge tone="green"><CheckIcon className="h-3 w-3" /> Verified</Badge>
  ) : (
    <Badge tone="amber"><ClockIcon className="h-3 w-3" /> In Validation</Badge>
  );
}

function ProjectCard({ card, onBuy, people }: { card: Card; onBuy: () => void; people?: ParticipantsResponse }) {
  const p = card.project;
  const sales = card.listing ? people?.listings[card.listing.listingId.toString()] : undefined;
  const owner = people?.owners[card.projectId];
  return (
    <article className="card flex flex-col overflow-hidden">
      <div className="relative">
        <ForestArt seed={card.projectId} className="h-32 w-full" />
        {p && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded bg-white/90 px-2 py-0.5 text-xs">
            <PinIcon className="h-3 w-3" /> {p.province}
          </span>
        )}
        <span className="absolute bottom-2 left-2"><StatusBadge verified={card.verified} /></span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-semibold leading-snug">
          <Link href={`/projects/${card.projectId}`} className="hover:underline">{p?.name ?? `Project #${card.projectId}`}</Link>
        </h3>
        {p && (
          <div className="mt-2 flex items-center gap-1.5 text-sm text-muted"><PinIcon className="h-3.5 w-3.5" /> {p.province}, Lao PDR</div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 text-sm">
          <div>
            <div className="text-muted">Available</div>
            <div className="font-semibold tabular-nums">{card.listing ? `${fmtTons(card.listing.available)} tCO₂e` : "—"}</div>
          </div>
          <div className="text-right">
            <div className="text-muted">Price per Ton</div>
            <div className="font-semibold tabular-nums">{card.listing ? fmtUsd(card.listing.pricePerTon) : "—"}</div>
          </div>
        </div>
        {p && <p className="mt-3 line-clamp-2 text-sm text-muted">{p.description}</p>}
        {card.listing && <Availability available={card.listing.available} retired={BigInt(sales?.retiredTons ?? 0)} />}
        <People projectId={card.projectId} ownerFallback={p?.company} owner={owner} sales={sales} />
        <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
          <Link className="btn-secondary" href={`/projects/${card.projectId}`}>View Details</Link>
          <button className="btn-primary" onClick={onBuy} disabled={!card.listing}>
            {card.listing ? "Buy & Offset" : "Not listed"}
          </button>
        </div>
      </div>
    </article>
  );
}

function Availability({ available, retired }: { available: bigint; retired: bigint }) {
  const total = available + retired;
  const pct = total > 0n ? Number((available * 1000n) / total) / 10 : 100;
  return (
    <div className="mt-3" title={`${fmtTons(available)} of ${fmtTons(total)} tCO₂e still available`}>
      <div className="flex justify-between text-xs">
        <span className="font-medium text-brand">{pct}% available</span>
        <span className="text-muted">{retired > 0n ? `${fmtTons(retired)} tCO₂e retired` : "None retired yet"}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Credits still available">
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const shortWallet = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;

function People({ projectId, owner, ownerFallback, sales }: {
  projectId: number;
  owner?: Participant;
  ownerFallback?: string;
  sales?: ParticipantsResponse["listings"][string];
}) {
  const ownerName = owner?.name ?? ownerFallback ?? (owner ? shortWallet(owner.wallet) : "—");
  const buyers = sales?.buyers ?? [];
  const extra = (sales?.buyerCount ?? 0) - Math.min(buyers.length, 4);
  return (
    <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
      <div className="flex min-w-0 items-center gap-2" title={owner ? `Forest owner · ${owner.wallet}` : "Forest owner"}>
        <WalletAvatar wallet={owner?.wallet ?? `0x${projectId.toString(16).padStart(6, "0")}`} name={ownerName} avatarUrl={owner?.avatarUrl} size={26} />
        <div className="min-w-0 leading-tight">
          <div className="text-[11px] text-muted">Owner</div>
          <div className="truncate text-xs font-medium">{ownerName}</div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {buyers.length > 0 && (
          <div className="flex -space-x-2">
            {buyers.slice(0, 4).map((b) => (
              <span key={b.wallet} title={`${b.name ?? shortWallet(b.wallet)} · ${fmtTons(BigInt(b.tons))} tCO₂e retired`}>
                <WalletAvatar wallet={b.wallet} name={b.name} avatarUrl={b.avatarUrl} size={24} className="ring-2 ring-white" />
              </span>
            ))}
            {extra > 0 && (
              <span className="grid h-6 w-6 place-items-center rounded-full bg-canvas text-[10px] font-semibold text-muted ring-2 ring-white">+{extra}</span>
            )}
          </div>
        )}
        <span className="text-xs text-muted">
          {sales?.buyerCount ? `${sales.buyerCount} buyer${sales.buyerCount > 1 ? "s" : ""}` : "No buyers yet"}
        </span>
      </div>
    </div>
  );
}
