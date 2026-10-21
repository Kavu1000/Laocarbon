"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { isAddress, keccak256, toHex, type Address } from "viem";
import { useAccount, usePublicClient, useReadContracts, useWriteContract } from "wagmi";
import { AlertIcon, CheckIcon, ClockIcon, CloseIcon, DocIcon, SearchIcon } from "@/components/icons";
import { RequireAuth } from "@/components/RequireAuth";
import { Badge, StatCard } from "@/components/ui";
import { useAuth, type ProfileRow } from "@/lib/auth";
import { carbonTokenAbi, marketplaceAbi, useContracts } from "@/lib/contracts";
import { errMessage, fmtTons } from "@/lib/format";
import { useAfterTx, useRegisteredProjects } from "@/lib/hooks";
import {
  BOUNDARY_DOC, documentUrl, METHOD_LABEL, recordVerification, type VerificationMethod, type VerificationResult, placeholderCid, PROJECT_TYPES, PROVINCES, REQUIRED_DOCUMENTS, reviewProject, STATUS_LABEL, STATUS_TONE,
  useProjectDetail, useReviewQueue, type ProjectRow, type ProjectStatus,
} from "@/lib/projects";
import { supabase } from "@/lib/supabase/client";
import { areaHa, fmtHa, pinFrom } from "@/lib/geo";
import dynamic from "next/dynamic";

const mapLoading = () => <div className="h-[340px] animate-pulse rounded-lg bg-canvas" />;
const ProjectMap = dynamic(() => import("@/components/map/ProjectMap").then((m) => m.ProjectMap), { ssr: false, loading: mapLoading });
const CompareSlider = dynamic(() => import("@/components/map/CompareSlider").then((m) => m.CompareSlider), { ssr: false, loading: mapLoading });

const REGISTRAR_ROLE = keccak256(toHex("REGISTRAR_ROLE"));
const MINTER_ROLE = keccak256(toHex("MINTER_ROLE"));
const FILTER_STATUSES: ProjectStatus[] = ["pending_review", "in_validation", "changes_requested", "approved", "rejected"];

export default function AuditorPage() {
  return (
    <RequireAuth roles={["auditor", "admin"]} reason="The auditor dashboard is for LaoCarbon registry auditors.">
      <AuditorDashboard />
    </RequireAuth>
  );
}

function AuditorDashboard() {
  const { data: projects = [], isLoading, error } = useReviewQueue(true);
  const { data: registered } = useRegisteredProjects();
  const [query, setQuery] = useState("");
  const [province, setProvince] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState<number>();

  // On-chain registration is the source of truth for approval.
  const rows = useMemo(
    () => projects.map((p) => ({ ...p, status: registered?.has(p.id) ? ("approved" as const) : p.status })),
    [projects, registered],
  );
  const count = (...s: ProjectStatus[]) => rows.filter((r) => s.includes(r.status)).length;

  const filtered = rows.filter((p) => {
    const q = query.trim().toLowerCase();
    if (q && ![p.name, p.company, p.province, `${p.contact_first} ${p.contact_last}`].some((s) => s.toLowerCase().includes(q))) return false;
    if (province && p.province !== province) return false;
    if (type && p.type !== type) return false;
    if (status && p.status !== status) return false;
    return true;
  });
  const selected = rows.find((p) => p.id === selectedId);

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Auditor Dashboard</h1>
      <p className="mt-1 text-muted">Review and verify forestry carbon projects submitted to the Lao PDR registry.</p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pending Review" value={count("pending_review", "changes_requested")} unit="Awaiting a decision" icon={<DocIcon className="h-5 w-5" />} />
        <StatCard label="In Validation" value={count("in_validation")} unit="Under validation" icon={<ClockIcon className="h-5 w-5" />} />
        <StatCard label="Approved" value={count("approved")} unit="Registered on-chain" icon={<CheckIcon className="h-5 w-5" />} />
        <StatCard label="Rejected" value={count("rejected")} unit="Did not meet requirements" icon={<CloseIcon className="h-5 w-5" />} />
      </div>

      <KycRequests />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search projects, applicants, or keywords…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="input" aria-label="Province" value={province} onChange={(e) => setProvince(e.target.value)}>
          <option value="">All Provinces</option>
          {PROVINCES.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select className="input" aria-label="Project type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All Types</option>
          {PROJECT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select className="input" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {FILTER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      <div className="mt-4 text-sm text-muted">{isLoading ? "Loading…" : `${filtered.length} submitted projects`}</div>
      {error && <div className="mt-2 rounded-md bg-danger-soft p-3 text-sm text-danger">{error.message}</div>}
      <div className="card mt-2 overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-canvas text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Project Name</th>
              <th className="px-4 py-3 font-medium">Applicant / Company</th>
              <th className="px-4 py-3 font-medium">Province</th>
              <th className="px-4 py-3 font-medium">Submitted</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className={`border-t border-line ${p.id === selectedId ? "bg-brand-soft/50" : ""}`}>
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-muted">{p.company}</td>
                <td className="px-4 py-3">{p.province}</td>
                <td className="px-4 py-3 text-muted">
                  {p.submitted_at ? new Date(p.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                </td>
                <td className="px-4 py-3"><Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge></td>
                <td className="px-4 py-3 text-right">
                  <button className="btn-secondary px-3 py-1.5" onClick={() => setSelectedId(p.id)}>View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && <ReviewPanel key={selected.id} project={selected} onChain={registered?.get(selected.id)} onClose={() => setSelectedId(undefined)} />}
    </div>
  );
}

function KycRequests() {
  const queryClient = useQueryClient();
  const { data: pending = [] } = useQuery({
    queryKey: ["kyc-pending"],
    queryFn: async () => {
      const { data, error } = await supabase().from("profiles").select("*").eq("kyc_status", "pending").order("updated_at");
      if (error) throw new Error(error.message);
      return data as ProfileRow[];
    },
  });
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  async function decide(id: string, status: "verified" | "rejected") {
    setBusy(id);
    setError(undefined);
    const { error } = await supabase().rpc("set_kyc_status", { target: id, status });
    setBusy(undefined);
    if (error) setError(error.message);
    queryClient.invalidateQueries({ queryKey: ["kyc-pending"] });
  }

  if (pending.length === 0) return null;
  return (
    <section className="card mt-6 p-5">
      <h2 className="font-semibold">Organisation Verification Requests <Badge tone="amber">{pending.length}</Badge></h2>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <ul className="mt-3 divide-y divide-line">
        {pending.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-medium">{p.org_name}</div>
              <div className="text-muted">{p.full_name} · {p.role.replace("_", " ")}{p.website && ` · ${p.website}`}</div>
            </div>
            <button className="btn-secondary px-3 py-1.5" disabled={busy === p.id} onClick={() => decide(p.id, "rejected")}>Reject</button>
            <button className="btn-primary px-3 py-1.5" disabled={busy === p.id} onClick={() => decide(p.id, "verified")}>Verify</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReviewPanel({ project: p, onChain, onClose }: { project: ProjectRow; onChain?: { forestOwner: Address; auditor: Address }; onClose: () => void }) {
  const { data: detail } = useProjectDetail(p.id);
  const docs = detail?.documents ?? [];
  const docByType = new Map(docs.map((d) => [d.doc_type, d]));
  const have = REQUIRED_DOCUMENTS.filter((d) => docByType.has(d)).length;
  const [openErr, setOpenErr] = useState<string>();

  const issues = [
    ...REQUIRED_DOCUMENTS.filter((d) => !docByType.has(d)).map((d) => ({ text: `${d} is missing.`, level: "High" })),
    ...(!docByType.has(BOUNDARY_DOC) && !pinFrom(p.lat, p.lng) ? [{ text: "No project boundary or coordinates provided.", level: "Medium" }] : []),
    ...(!p.payout_wallet && !onChain ? [{ text: "No payout wallet on file — set the forest owner wallet before approving.", level: "Medium" }] : []),
  ];

  async function open(path: string) {
    setOpenErr(undefined);
    try {
      window.open(await documentUrl(path), "_blank", "noopener");
    } catch (e) {
      setOpenErr(errMessage(e));
    }
  }

  return (
    <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{p.name}</h2>
            <div className="mt-1"><Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge></div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas" aria-label="Close"><CloseIcon className="h-5 w-5" /></button>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="font-semibold">Project Information</h3>
            <dl className="mt-2 space-y-1.5 text-sm">
              {[
                ["Applicant", `${p.contact_first} ${p.contact_last}`],
                ["Company", p.company],
                ["Contact", [p.contact_email, p.contact_phone].filter(Boolean).join(" · ")],
                ["Project Type", p.type],
                ["Location", [p.village, p.district, p.province].filter(Boolean).join(", ")],
                ["Coordinates", pinFrom(p.lat, p.lng) ? `${p.lat}, ${p.lng}` : "—"],
                ["Project Area", p.area_ha ? `${fmtTons(Number(p.area_ha))} ha` : "—"],
                ["Estimated Credits", p.estimated_credits ? `${fmtTons(Number(p.estimated_credits))} tCO₂e` : "—"],
                ["Credit Period", p.credit_period || "—"],
                ["Standard", p.standard],
                ["Payout Wallet", onChain?.forestOwner ?? p.payout_wallet ?? "—"],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[130px_1fr] gap-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="break-all">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm text-muted">{p.description}</p>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Document Checklist</h3>
              <span className="text-sm text-muted">{have} of {REQUIRED_DOCUMENTS.length} complete</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-canvas"><div className="h-2 rounded-full bg-brand" style={{ width: `${(have / REQUIRED_DOCUMENTS.length) * 100}%` }} /></div>
            <ul className="mt-3 space-y-2 text-sm">
              {[...REQUIRED_DOCUMENTS, BOUNDARY_DOC].map((t) => {
                const d = docByType.get(t);
                return (
                  <li key={t} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2"><DocIcon className="h-4 w-4 shrink-0 text-muted" /> <span className="truncate">{t}</span></span>
                    {d ? (
                      <button className="btn-secondary px-2.5 py-1 text-xs" onClick={() => open(d.storage_path)} title={d.file_name}>View</button>
                    ) : (
                      <Badge tone={t === BOUNDARY_DOC ? "gray" : "red"}>Missing</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
            {openErr && <p className="mt-2 text-xs text-danger">{openErr}</p>}

            {issues.length > 0 && (
              <div className="mt-5">
                <h3 className="flex items-center gap-2 font-semibold"><AlertIcon className="h-4 w-4 text-warn" /> Flagged Issues <Badge>{issues.length}</Badge></h3>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {issues.map((i) => (
                    <li key={i.text} className="flex items-start justify-between gap-2">
                      <span className="text-muted">{i.text}</span>
                      <Badge tone={i.level === "High" ? "red" : "amber"}>{i.level}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!!detail?.notes.length && (
              <div className="mt-5">
                <h3 className="font-semibold">Review History</h3>
                <ol className="mt-2 space-y-2 border-l border-line pl-4 text-sm">
                  {detail.notes.map((n) => (
                    <li key={n.id}>
                      <div className="font-medium">{n.decision}</div>
                      <div className="text-muted">{n.note}</div>
                      <div className="text-xs text-muted">{new Date(n.created_at).toLocaleString("en-GB")}</div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6">
          <h3 className="font-semibold">Forest boundary</h3>
          <p className="mb-2 text-sm text-muted">
            {p.boundary ? `${fmtHa(areaHa(p.boundary))} mapped vs ${p.area_ha ? fmtHa(Number(p.area_ha)) : "—"} declared.` : "No boundary submitted — only a GPS pin, if any."}
          </p>
          <ProjectMap boundary={p.boundary} pin={pinFrom(p.lat, p.lng)} status="validation" className="h-[340px]" />
          {p.boundary && (
            <div className="mt-4">
              <h3 className="font-semibold">Land-cover change</h3>
              <CompareSlider boundary={p.boundary} status="validation" />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <DecisionPanel project={p} onChain={onChain} />
        <VerificationForm projectId={p.id} />
      </div>
    </section>
  );
}

type Decision = "approve" | "validate" | "changes" | "reject";

function DecisionPanel({ project: p, onChain }: { project: ProjectRow; onChain?: { forestOwner: Address; auditor: Address } }) {
  const c = useContracts();
  const { user } = useAuth();
  const { address, isConnected } = useAccount();
  const client = usePublicClient({ chainId: c.chainId });
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const afterTx = useAfterTx();

  const [decision, setDecision] = useState<Decision>("approve");
  const [note, setNote] = useState("");
  const [owner, setOwner] = useState(p.payout_wallet ?? "");
  const [auditor, setAuditor] = useState("");
  const [credits, setCredits] = useState(String(p.estimated_credits ?? ""));
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();

  const { data: roles } = useReadContracts({
    contracts: [
      { address: c.ready ? c.marketplace : undefined, abi: marketplaceAbi, functionName: "hasRole", args: [REGISTRAR_ROLE, address!], chainId: c.chainId },
      { address: c.ready ? c.carbonToken : undefined, abi: carbonTokenAbi, functionName: "hasRole", args: [MINTER_ROLE, address!], chainId: c.chainId },
    ],
    query: { enabled: c.ready && !!address },
  });
  const canRegister = roles?.[0].result === true && roles?.[1].result === true;
  const auditorAddr = auditor || address || "";

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["review-queue"] });
    queryClient.invalidateQueries({ queryKey: ["project-detail", p.id] });
    queryClient.invalidateQueries({ queryKey: ["public-projects"] });
  };

  if (onChain) {
    return (
      <div className="card h-fit p-5">
        <h3 className="font-semibold">Verification Decision</h3>
        <div className="mt-3 rounded-md bg-brand-soft p-4 text-sm text-brand">
          <div className="flex items-center gap-2 font-medium"><CheckIcon className="h-4 w-4" /> Approved & registered on-chain</div>
          <div className="mt-2 break-all text-xs">Forest owner: {onChain.forestOwner}</div>
          <div className="mt-1 break-all text-xs">Auditor of record: {onChain.auditor}</div>
        </div>
      </div>
    );
  }

  async function submit() {
    if (!user) return;
    setError(undefined);
    setDone(undefined);
    try {
      if (decision !== "approve") {
        const map = { validate: "in_validation", changes: "changes_requested", reject: "rejected" } as const;
        const label = { validate: "Moved to validation", changes: "Changes requested", reject: "Rejected" }[decision];
        setBusy("Saving…");
        await reviewProject(p.id, user.id, map[decision], label, note.trim());
        setNote("");
        setDone(`${label}.`);
        refresh();
        return;
      }
      if (!c.ready || !client) return;
      const tons = BigInt(credits);
      const cid = p.ipfs_cid ?? placeholderCid(p.id);

      // Contract roles are the real authority: these calls revert unless this wallet holds REGISTRAR/MINTER.
      setBusy("Registering project (1/3)…");
      let hash = await writeContractAsync({
        address: c.marketplace,
        abi: marketplaceAbi,
        functionName: "registerProject",
        args: [BigInt(p.id), owner as Address, auditorAddr as Address, cid],
      });
      let r = await client.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error("registerProject reverted");

      setBusy("Issuing credits (2/3)…");
      hash = await writeContractAsync({ address: c.carbonToken, abi: carbonTokenAbi, functionName: "mint", args: [owner as Address, tons] });
      r = await client.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error("mint reverted");

      setBusy("Recording decision (3/3)…");
      await reviewProject(p.id, user.id, "approved", `Approved — ${fmtTons(tons)} tCO₂e issued`, note.trim(), { payout_wallet: owner, ipfs_cid: cid });
      await recordVerification({
        projectId: p.id,
        auditorId: user.id,
        method: "document_review",
        result: "passed",
        summary: `Project documents reviewed and approved; ${fmtTons(tons)} tCO₂e issued on-chain.`,
      });
      queryClient.invalidateQueries({ queryKey: ["verification", p.id] });
      await afterTx();
      refresh();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(undefined);
    }
  }

  const approveInvalid =
    decision === "approve" && (!isAddress(owner) || !isAddress(auditorAddr) || !/^[1-9]\d*$/.test(credits) || !canRegister);
  const disabled = !!busy || !note.trim() || approveInvalid;

  return (
    <div className="card h-fit p-5">
      <h3 className="font-semibold">Verification Decision</h3>
      <div className="mt-3 space-y-2">
        {([
          ["approve", "Approve Project", "Register on-chain and issue credits"],
          ["validate", "Start Validation", "Mark as under third-party validation"],
          ["changes", "Request Changes", "Send back to applicant for revisions"],
          ["reject", "Reject Project", "Does not meet requirements"],
        ] as const).map(([v, t, s]) => (
          <label key={v} className={`flex cursor-pointer gap-3 rounded-md border p-3 ${decision === v ? "border-brand bg-brand-soft/40" : "border-line"}`}>
            <input type="radio" name="decision" className="mt-1 accent-brand" checked={decision === v} onChange={() => setDecision(v)} />
            <span className="text-sm"><span className="font-medium">{t}</span><span className="block text-xs text-muted">{s}</span></span>
          </label>
        ))}
      </div>

      {decision === "approve" && (
        <div className="mt-4 space-y-3">
          <div>
            <label className="label" htmlFor="ow">Forest owner wallet</label>
            <input id="ow" className="input font-mono text-xs" value={owner} onChange={(e) => setOwner(e.target.value.trim())} placeholder="0x…" />
          </div>
          <div>
            <label className="label" htmlFor="au">Auditor wallet (receives 5%)</label>
            <input id="au" className="input font-mono text-xs" value={auditor} onChange={(e) => setAuditor(e.target.value.trim())} placeholder={address ?? "0x…"} />
          </div>
          <div>
            <label className="label" htmlFor="cr">Credits to issue (tCO₂e)</label>
            <input id="cr" className="input" inputMode="numeric" value={credits} onChange={(e) => setCredits(e.target.value.replace(/[^\d]/g, ""))} />
          </div>
          {!isConnected ? (
            <p className="rounded-md bg-warn-soft p-3 text-sm text-warn">Connect the registry wallet to approve.</p>
          ) : roles && !canRegister ? (
            <p className="rounded-md bg-warn-soft p-3 text-sm text-warn">
              This wallet lacks REGISTRAR_ROLE / MINTER_ROLE on the contracts. On a local chain, use Hardhat account #0.
            </p>
          ) : null}
        </div>
      )}

      <label className="label mt-4" htmlFor="note">Note to the applicant <span className="text-danger">*</span></label>
      <textarea id="note" className="input min-h-24" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Feedback, required changes, or next steps…" />
      <div className="mt-1 text-right text-xs text-muted">{note.length}/1000</div>

      {error && <div className="mt-3 rounded-md bg-danger-soft p-3 text-sm text-danger">{error}</div>}
      {done && <div className="mt-3 rounded-md bg-brand-soft p-3 text-sm text-brand">{done}</div>}
      <button className="btn-primary mt-3 w-full" disabled={disabled} onClick={submit}>{busy ?? "Submit Decision"}</button>
    </div>
  );
}

function VerificationForm({ projectId }: { projectId: number }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: events = [] } = useQuery({
    queryKey: ["verification", projectId, "all"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("verification_events")
        .select("id, method, result, summary, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data as { id: number; method: VerificationMethod; result: VerificationResult; summary: string; created_at: string }[];
    },
  });
  const [method, setMethod] = useState<VerificationMethod>("satellite_analysis");
  const [result, setResult] = useState<VerificationResult>("passed");
  const [summary, setSummary] = useState("");
  const [imageryDate, setImageryDate] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const urlInvalid = !!evidenceUrl && !/^https?:\/\/\S+$/i.test(evidenceUrl);

  async function submit() {
    if (!user) return;
    setBusy(true);
    setError(undefined);
    try {
      await recordVerification({ projectId, auditorId: user.id, method, result, summary: summary.trim(), imageryDate, evidenceUrl: evidenceUrl.trim() });
      setSummary("");
      setImageryDate("");
      setEvidenceUrl("");
      queryClient.invalidateQueries({ queryKey: ["verification", projectId] });
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <h3 className="font-semibold">Record Verification</h3>
      <p className="mt-1 text-xs text-muted">Shown publicly on the project page so buyers can see what was checked.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <select className="input" aria-label="Method" value={method} onChange={(e) => setMethod(e.target.value as VerificationMethod)}>
          {(Object.keys(METHOD_LABEL) as VerificationMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
        </select>
        <select className="input" aria-label="Result" value={result} onChange={(e) => setResult(e.target.value as VerificationResult)}>
          <option value="passed">Passed</option>
          <option value="flagged">Flagged</option>
          <option value="failed">Failed</option>
        </select>
      </div>
      <textarea className="input mt-2 min-h-20" maxLength={500} aria-label="Summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What was checked and what you found…" />
      {method === "satellite_analysis" && (
        <label className="mt-2 block text-sm">
          <span className="label">Imagery date</span>
          <input type="date" className="input" value={imageryDate} onChange={(e) => setImageryDate(e.target.value)} />
        </label>
      )}
      <input className={`input mt-2 ${urlInvalid ? "border-danger" : ""}`} aria-label="Evidence link" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} placeholder="Evidence link (https://…) — optional" />
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <button className="btn-primary mt-3 w-full" disabled={busy || !summary.trim() || urlInvalid} onClick={submit}>{busy ? "Saving…" : "Add record"}</button>

      {events.length > 0 && (
        <ol className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
          {events.map((e) => (
            <li key={e.id}>
              <span className="font-medium">{METHOD_LABEL[e.method]}</span>{" "}
              <Badge tone={e.result === "passed" ? "green" : e.result === "flagged" ? "amber" : "red"}>{e.result}</Badge>
              <div className="text-xs text-muted">{new Date(e.created_at).toLocaleDateString("en-GB")} · {e.summary}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
