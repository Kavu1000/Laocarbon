"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { BuyOffsetModal } from "@/components/BuyOffsetModal";
import { AlertIcon, BuildingIcon, CheckIcon, ClockIcon, DocIcon, PinIcon, ShieldIcon } from "@/components/icons";
import { CompareSlider } from "@/components/map/CompareSlider";
import { ProjectMap } from "@/components/map/ProjectMap";
import type { MapStatus } from "@/components/map/styles";
import { Badge, Empty } from "@/components/ui";
import { fmtTons, fmtUsd, shortAddr } from "@/lib/format";
import { areaHa, fmtHa, pinFrom } from "@/lib/geo";
import { useListings, useRegisteredProjects } from "@/lib/hooks";
import {
  METHOD_LABEL, REQUIRED_DOCUMENTS, usePublicProject, useVerification,
  type VerificationEvent, type VerificationMethod, type VerificationResult,
} from "@/lib/projects";

const METHODS: VerificationMethod[] = ["document_review", "satellite_analysis", "field_visit"];
const RESULT_TONE: Record<VerificationResult, "green" | "amber" | "red"> = { passed: "green", flagged: "amber", failed: "red" };
const fmtDay = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number(use(params).id);
  const { data: project, isLoading } = usePublicProject(id);
  const { data: events = [] } = useVerification(id);
  const { listings } = useListings();
  const { data: registered } = useRegisteredProjects();
  const [buying, setBuying] = useState(false);

  const onChain = registered?.get(id);
  const listing = useMemo(
    () => listings.filter((l) => Number(l.projectId) === id && l.available > 0n).sort((a, b) => Number(a.pricePerTon - b.pricePerTon))[0],
    [listings, id],
  );
  const latest = useMemo(() => {
    const m = new Map<VerificationMethod, VerificationEvent>();
    for (const e of events) if (!m.has(e.method)) m.set(e.method, e); // events are newest-first
    return m;
  }, [events]);

  if (isLoading) return <div className="py-16 text-center text-muted">Loading project…</div>;
  if (!project) return <Empty title="Project not found">It may not be listed yet. <Link href="/" className="text-brand underline">Back to Marketplace</Link></Empty>;

  const flagged = [...latest.values()].some((e) => e.result !== "passed");
  const mapStatus: MapStatus = flagged ? "flagged" : project.status === "approved" ? "verified" : "validation";
  const pin = pinFrom(project.lat, project.lng);
  const mapped = project.boundary ? areaHa(project.boundary) : null;
  const lastVerified = events.find((e) => e.result === "passed")?.created_at;

  return (
    <div>
      <Link href="/" className="text-sm text-muted hover:text-ink">← Marketplace</Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            {project.status === "approved" ? (
              <Badge tone="green"><CheckIcon className="h-3 w-3" /> Verified</Badge>
            ) : (
              <Badge tone="amber"><ClockIcon className="h-3 w-3" /> In Validation</Badge>
            )}
            <span className="flex items-center gap-1"><PinIcon className="h-4 w-4" /> {[project.district, project.province].filter(Boolean).join(", ")}, Lao PDR</span>
            <span className="flex items-center gap-1"><BuildingIcon className="h-4 w-4" /> {project.company}</span>
          </div>
        </div>
        <div className="card flex items-center gap-5 p-4">
          <div>
            <div className="text-xs text-muted">Price</div>
            <div className="text-xl font-semibold tabular-nums">{listing ? fmtUsd(listing.pricePerTon) : "—"}</div>
            <div className="text-xs text-muted">{listing ? `${fmtTons(listing.available)} tCO₂e available` : "Not currently listed"}</div>
          </div>
          <button className="btn-primary py-2.5" disabled={!listing} onClick={() => setBuying(true)}>Buy & Offset Carbon</button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <section>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Forest Coverage Map</h2>
                <p className="text-sm text-muted">Project boundary submitted by the forest owner{pin && " · GPS pin"}.</p>
              </div>
              <Legend />
            </div>
            <ProjectMap boundary={project.boundary} pin={pin} status={mapStatus} className="h-[460px]" />
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat k="Mapped area" v={mapped !== null ? fmtHa(mapped) : "—"} />
              <Stat k="Declared area" v={project.area_ha ? fmtHa(Number(project.area_ha)) : "—"} />
              <Stat k="GPS" v={pin ? `${pin[1].toFixed(4)}, ${pin[0].toFixed(4)}` : "—"} />
              <Stat k="Credit period" v={project.credit_period || "—"} />
            </dl>
            {mapped !== null && project.area_ha && Math.abs(mapped - Number(project.area_ha)) / Number(project.area_ha) > 0.1 && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-warn">
                <AlertIcon className="h-4 w-4" /> Mapped area differs from the declared area by more than 10%.
              </p>
            )}
          </section>

          {project.boundary && (
            <section>
              <h2 className="text-lg font-semibold">Land-cover change</h2>
              <p className="mb-2 text-sm text-muted">Compare satellite imagery of this exact area across years.</p>
              <CompareSlider boundary={project.boundary} status={mapStatus} />
            </section>
          )}

          <section className="card p-5">
            <h2 className="font-semibold">About this project</h2>
            <p className="mt-2 text-sm leading-relaxed">{project.description}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <h3 className="text-sm font-semibold">Project type</h3>
                <p className="text-sm text-muted">{project.type}</p>
                <h3 className="mt-3 text-sm font-semibold">Standard</h3>
                <p className="text-sm text-muted">{project.standard}</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Co-benefits</h3>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {project.co_benefits.length ? project.co_benefits.map((b) => <Badge key={b}>{b}</Badge>) : <span className="text-sm text-muted">—</span>}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Documents on file</h3>
                <ul className="mt-1 space-y-1 text-sm text-muted">
                  {REQUIRED_DOCUMENTS.map((d) => (
                    <li key={d} className="flex items-center gap-1.5">
                      {project.document_types.includes(d) ? <CheckIcon className="h-3.5 w-3.5 text-brand" /> : <DocIcon className="h-3.5 w-3.5" />}
                      {d}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-muted">Reviewed by registry auditors; not publicly downloadable.</p>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <section className="card p-5">
            <h2 className="flex items-center gap-2 font-semibold"><ShieldIcon className="h-5 w-5 text-brand" /> Verification</h2>
            <ul className="mt-4 space-y-3">
              {METHODS.map((m) => {
                const e = latest.get(m);
                return (
                  <li key={m} className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{METHOD_LABEL[m]}</div>
                      <div className="text-xs text-muted">{e ? fmtDay(e.created_at) : "Not yet performed"}</div>
                    </div>
                    {e ? <Badge tone={RESULT_TONE[e.result]}>{e.result === "passed" ? "Passed" : e.result === "flagged" ? "Flagged" : "Failed"}</Badge> : <Badge>Pending</Badge>}
                  </li>
                );
              })}
              <li className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">On-chain registration</div>
                  <div className="text-xs text-muted">{onChain ? `Owner ${shortAddr(onChain.forestOwner)} · Auditor ${shortAddr(onChain.auditor)}` : "Not registered yet"}</div>
                </div>
                {onChain ? <Badge tone="green">Registered</Badge> : <Badge>Pending</Badge>}
              </li>
            </ul>
            <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted">Last verified</dt><dd>{lastVerified ? fmtDay(lastVerified) : "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Auditor</dt><dd className="text-right">{events[0]?.auditor_org ?? "—"}</dd></div>
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="font-semibold">Verification history</h2>
            {events.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No verification records yet.</p>
            ) : (
              <ol className="mt-3 space-y-4 border-l border-line pl-4">
                {events.map((e) => (
                  <li key={e.id} className="relative">
                    <span className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${e.result === "passed" ? "bg-brand" : e.result === "flagged" ? "bg-warn" : "bg-danger"}`} />
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {METHOD_LABEL[e.method]} <Badge tone={RESULT_TONE[e.result]}>{e.result}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-muted">{e.summary}</p>
                    <div className="mt-1 text-xs text-muted">
                      {fmtDay(e.created_at)} · {e.auditor_name}
                      {e.imagery_date && <> · imagery {fmtDay(e.imagery_date)}</>}
                      {e.evidence_url && (
                        <> · <a href={e.evidence_url} target="_blank" rel="noopener noreferrer" className="text-brand underline">evidence</a></>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>

      {buying && listing && <BuyOffsetModal listing={listing} projectName={project.name} onClose={() => setBuying(false)} />}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md border border-line bg-white p-3">
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums">{v}</dd>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex gap-3 text-xs text-muted">
      {[["#16a34a", "Verified"], ["#d97706", "In validation"], ["#dc2626", "Flagged"]].map(([c, l]) => (
        <span key={l} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} /> {l}</span>
      ))}
    </div>
  );
}
