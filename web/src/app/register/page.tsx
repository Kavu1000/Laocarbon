"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth";
import { CheckIcon, DocIcon } from "@/components/icons";
import { Badge } from "@/components/ui";
import { shortAddr } from "@/lib/format";
import { BOUNDARY_DOC, PROJECT_TYPES, PROVINCES, REQUIRED_DOCUMENTS, saveProject, uploadDocument, type ProjectInput, type ProjectRow } from "@/lib/projects";
import { supabase } from "@/lib/supabase/client";

const STEPS = [
  { title: "Applicant Information", sub: "Your personal or organisation details" },
  { title: "Project Information", sub: "Project details and description" },
  { title: "Location", sub: "Where the project is and its boundary" },
  { title: "Documents Upload", sub: "Required project documents" },
  { title: "Review & Submit", sub: "Check information and submit" },
];

type Draft = {
  firstName: string; lastName: string; company: string; email: string; phone: string;
  name: string; type: string; description: string; areaHa: string; estimatedCredits: string; creditPeriod: string; standard: string;
  province: string; district: string; village: string; lat: string; lng: string; boundaryFile: string;
  documents: Record<string, string>;
};

const EMPTY: Draft = {
  firstName: "", lastName: "", company: "", email: "", phone: "",
  name: "", type: "", description: "", areaHa: "", estimatedCredits: "", creditPeriod: "", standard: "VCS",
  province: "", district: "", village: "", lat: "", lng: "", boundaryFile: "",
  documents: {},
};

const MAX_FILE = 10 * 1024 * 1024;

function validate(step: number, d: Draft): Record<string, string> {
  const e: Record<string, string> = {};
  const req = (k: keyof Draft, msg = "Required") => {
    if (!String(d[k]).trim()) e[k] = msg;
  };
  if (step === 0) {
    req("firstName"); req("lastName"); req("email"); req("phone");
    if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) e.email = "Enter a valid email";
    if (d.phone && !/^[\d\s-]{6,}$/.test(d.phone)) e.phone = "Enter a valid phone number";
  }
  if (step === 1) {
    req("name"); req("type"); req("description"); req("areaHa"); req("estimatedCredits"); req("creditPeriod");
    if (d.areaHa && !(Number(d.areaHa) > 0)) e.areaHa = "Must be a positive number";
    if (d.estimatedCredits && !/^\d+$/.test(d.estimatedCredits)) e.estimatedCredits = "Whole tonnes only";
  }
  if (step === 2) {
    req("province"); req("district"); req("village");
    if (d.lat && !(Math.abs(Number(d.lat)) <= 90)) e.lat = "Invalid latitude";
    if (d.lng && !(Math.abs(Number(d.lng)) <= 180)) e.lng = "Invalid longitude";
  }
  if (step === 3) {
    for (const doc of REQUIRED_DOCUMENTS.slice(0, 2)) if (!d.documents[doc]) e[doc] = "Required";
  }
  return e;
}

export default function RegisterPage() {
  return (
    <RequireAuth reason="Sign in with your organisation account to register a forestry carbon project.">
      <RegisterProjectForm />
    </RequireAuth>
  );
}

function RegisterProjectForm() {
  const { user } = useAuth();
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<string>();
  const [submitted, setSubmitted] = useState<{ id: number; name: string }>();
  const [draftId, setDraftId] = useState<number>();
  const [files, setFiles] = useState<Record<string, File>>({});
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  // Resume the latest draft (or a project sent back for changes); otherwise prefill from the profile.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const sb = supabase();
      const { data: row } = await sb
        .from("projects")
        .select("*")
        .eq("owner_id", user.id)
        .in("status", ["draft", "changes_requested"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<ProjectRow>();
      if (row) {
        const { data: docs } = await sb.from("project_documents").select("doc_type, file_name").eq("project_id", row.id);
        const names = Object.fromEntries((docs ?? []).map((x: { doc_type: string; file_name: string }) => [x.doc_type, x.file_name]));
        setDraftId(row.id);
        setSavedAt(new Date(row.updated_at).toLocaleString("en-GB"));
        setD({
          firstName: row.contact_first, lastName: row.contact_last, company: row.company, email: row.contact_email,
          phone: row.contact_phone.replace(/^\+?856\s*/, ""), name: row.name, type: row.type, description: row.description,
          areaHa: row.area_ha?.toString() ?? "", estimatedCredits: row.estimated_credits?.toString() ?? "",
          creditPeriod: row.credit_period, standard: row.standard || "VCS", province: row.province, district: row.district,
          village: row.village, lat: row.lat?.toString() ?? "", lng: row.lng?.toString() ?? "",
          boundaryFile: names[BOUNDARY_DOC] ?? "", documents: names,
        });
        return;
      }
      const [firstName, ...rest] = user.fullName.split(/\s+/);
      setD((x) => ({
        ...x,
        firstName,
        lastName: rest.join(" "),
        company: user.orgName,
        email: user.email,
        phone: user.phone.replace(/^\+?856\s*/, ""),
      }));
    })();
  }, [user]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    setErrors((x) => ({ ...x, [k]: "" }));
  };

  const pickFile = (docType: string, file: File) => {
    setFiles((x) => ({ ...x, [docType]: file }));
    setD((x) => ({
      ...x,
      ...(docType === BOUNDARY_DOC ? { boundaryFile: file.name } : { documents: { ...x.documents, [docType]: file.name } }),
    }));
    setErrors((x) => ({ ...x, [docType]: "" }));
  };

  const toInput = (): ProjectInput => ({
    name: d.name.trim(),
    company: d.company.trim() || `${d.firstName} ${d.lastName}`.trim(),
    type: d.type,
    description: d.description.trim(),
    area_ha: d.areaHa ? Number(d.areaHa) : null,
    estimated_credits: /^\d+$/.test(d.estimatedCredits) ? Number(d.estimatedCredits) : null,
    credit_period: d.creditPeriod.trim(),
    standard: d.standard,
    province: d.province,
    district: d.district.trim(),
    village: d.village.trim(),
    lat: d.lat ? Number(d.lat) : null,
    lng: d.lng ? Number(d.lng) : null,
    contact_first: d.firstName.trim(),
    contact_last: d.lastName.trim(),
    contact_email: d.email.trim(),
    contact_phone: d.phone ? `+856 ${d.phone.trim()}` : "",
    payout_wallet: address ?? null,
  });

  /** Saves fields as a draft and uploads any newly picked files. Returns the project id. */
  async function persistDraft() {
    if (!user) throw new Error("Not signed in");
    const id = await saveProject(user.id, toInput(), "draft", draftId);
    setDraftId(id);
    for (const [docType, file] of Object.entries(files)) {
      setBusy(`Uploading ${docType}…`);
      await uploadDocument(user.id, id, docType, file);
    }
    setFiles({});
    return id;
  }

  async function saveDraft() {
    setError(undefined);
    setBusy("Saving draft…");
    try {
      await persistDraft();
      setSavedAt(new Date().toLocaleString("en-GB"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  }

  function next() {
    const e = validate(step, d);
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    for (let s = 0; s < 4; s++) {
      const e = validate(s, d);
      if (Object.values(e).some(Boolean)) {
        setErrors(e);
        setStep(s);
        return;
      }
    }
    if (!address || !user) return;
    setError(undefined);
    setBusy("Saving…");
    try {
      // Upload while still a draft, then flip to pending_review so auditors never see a half-uploaded application.
      const id = await persistDraft();
      setBusy("Submitting…");
      await saveProject(user.id, toInput(), "pending_review", id);
      setSubmitted({ id, name: d.name.trim() });
      setDraftId(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  }

  if (submitted) {
    return (
      <div className="card mx-auto mt-8 max-w-lg p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-soft text-brand"><CheckIcon className="h-7 w-7" /></div>
        <h1 className="mt-4 text-2xl font-semibold">Application submitted</h1>
        <p className="mt-2 text-sm text-muted">
          <strong className="text-ink">{submitted.name}</strong> is now with the registry auditors as application #{submitted.id}. Once
          approved, credits are issued to {shortAddr(address)} and you can list them from your Portfolio.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button className="btn-secondary" onClick={() => { setSubmitted(undefined); setD(EMPTY); setStep(0); setSavedAt(undefined); }}>Register another</button>
          <Link className="btn-primary" href="/profile">Go to my profile</Link>
        </div>
      </div>
    );
  }

  const completed = STEPS.map((_, i) => i < step || (i < 4 && !Object.values(validate(i, d)).some(Boolean)));
  const pct = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold tracking-tight">Register a Forestry Carbon Project</h1>
        <p className="mt-1 text-muted">List your forest conservation or restoration project to attract buyers and generate carbon credits.</p>

        <ol className="mt-6 flex items-start gap-1 overflow-x-auto pb-1">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex min-w-[96px] flex-1 flex-col items-center text-center">
              <button
                onClick={() => i < step && setStep(i)}
                className={`grid h-9 w-9 place-items-center rounded-full text-sm font-semibold ${
                  i === step ? "bg-brand text-white" : i < step ? "bg-brand-soft text-brand" : "border border-line bg-white text-muted"
                }`}
                aria-current={i === step ? "step" : undefined}
              >
                {i < step ? <CheckIcon className="h-4 w-4" /> : i + 1}
              </button>
              <span className={`mt-2 text-xs sm:text-sm ${i === step ? "font-semibold" : "text-muted"}`}>{s.title}</span>
            </li>
          ))}
        </ol>

        <section className="card mt-6 p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-semibold text-white">{step + 1}</span>
            <div>
              <h2 className="text-lg font-semibold">{STEPS[step].title}</h2>
              <p className="text-sm text-muted">{STEPS[step].sub}</p>
            </div>
          </div>

          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First Name" required error={errors.firstName}><input className="input" value={d.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="Enter first name" /></Field>
              <Field label="Last Name" required error={errors.lastName}><input className="input" value={d.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder="Enter last name" /></Field>
              <Field label="Company / Organisation"><input className="input" value={d.company} onChange={(e) => set("company", e.target.value)} placeholder="Enter company or organisation name" /></Field>
              <Field label="Email Address" required error={errors.email}><input className="input" type="email" value={d.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" /></Field>
              <Field label="Phone Number" required error={errors.phone}>
                <div className="flex gap-2">
                  <span className="input w-20 shrink-0 text-center text-muted">+856</span>
                  <input className="input" inputMode="tel" value={d.phone} onChange={(e) => set("phone", e.target.value)} placeholder="20 5555 0000" />
                </div>
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Project Name" required error={errors.name}><input className="input" value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Nam Ha Forest Conservation Project" /></Field>
              <Field label="Project Type" required error={errors.type}>
                <select className="input" value={d.type} onChange={(e) => set("type", e.target.value)}>
                  <option value="">Select project type</option>
                  {PROJECT_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Short Project Description" required error={errors.description}>
                  <textarea className="input min-h-28" maxLength={1000} value={d.description} onChange={(e) => set("description", e.target.value)} placeholder="Describe the project goals, activities, expected impact, and local communities involved…" />
                  <div className="mt-1 text-right text-xs text-muted">{d.description.length} / 1000</div>
                </Field>
              </div>
              <Field label="Land Area (hectares)" required error={errors.areaHa}><input className="input" inputMode="decimal" value={d.areaHa} onChange={(e) => set("areaHa", e.target.value)} placeholder="Total project area" /></Field>
              <Field label="Estimated Credits (tCO₂e)" required error={errors.estimatedCredits}><input className="input" inputMode="numeric" value={d.estimatedCredits} onChange={(e) => set("estimatedCredits", e.target.value)} placeholder="Credits requested for issuance" /></Field>
              <Field label="Credit Period" required error={errors.creditPeriod}><input className="input" value={d.creditPeriod} onChange={(e) => set("creditPeriod", e.target.value)} placeholder="e.g. 2024 – 2034" /></Field>
              <Field label="Standard">
                <select className="input" value={d.standard} onChange={(e) => set("standard", e.target.value)}>
                  {["VCS", "Gold Standard", "Plan Vivo", "Other"].map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Country"><input className="input" value="Lao PDR" disabled /></Field>
              <Field label="Province" required error={errors.province}>
                <select className="input" value={d.province} onChange={(e) => set("province", e.target.value)}>
                  <option value="">Select province</option>
                  {PROVINCES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="District / City" required error={errors.district}><input className="input" value={d.district} onChange={(e) => set("district", e.target.value)} placeholder="District" /></Field>
              <Field label="Village" required error={errors.village}><input className="input" value={d.village} onChange={(e) => set("village", e.target.value)} placeholder="Village" /></Field>
              <Field label="Latitude" error={errors.lat}><input className="input" inputMode="decimal" value={d.lat} onChange={(e) => set("lat", e.target.value)} placeholder="e.g. 20.95" /></Field>
              <Field label="Longitude" error={errors.lng}><input className="input" inputMode="decimal" value={d.lng} onChange={(e) => set("lng", e.target.value)} placeholder="e.g. 101.40" /></Field>
              <div className="sm:col-span-2">
                <FileRow
                  label="Project Boundary (GeoJSON or KML)"
                  hint="Supports .geojson, .json, .kml (max 10 MB)"
                  accept=".geojson,.json,.kml"
                  value={d.boundaryFile}
                  onChange={(file) => pickFile(BOUNDARY_DOC, file)}
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              {REQUIRED_DOCUMENTS.map((doc, i) => (
                <FileRow
                  key={doc}
                  label={`${doc}${i < 2 ? " *" : ""}`}
                  hint="PDF, max 10 MB"
                  accept=".pdf"
                  value={d.documents[doc] ?? ""}
                  error={errors[doc]}
                  onChange={(file) => pickFile(doc, file)}
                />
              ))}
              <p className="text-xs text-muted">
                Files are stored privately — only you and registry auditors can open them.
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5 text-sm">
              <Review title="Applicant" onEdit={() => setStep(0)} rows={[["Name", `${d.firstName} ${d.lastName}`], ["Organisation", d.company || "—"], ["Email", d.email], ["Phone", `+856 ${d.phone}`]]} />
              <Review title="Project" onEdit={() => setStep(1)} rows={[["Name", d.name], ["Type", d.type], ["Area", `${d.areaHa} ha`], ["Estimated credits", `${d.estimatedCredits} tCO₂e`], ["Credit period", d.creditPeriod], ["Standard", d.standard]]} />
              <Review title="Location" onEdit={() => setStep(2)} rows={[["Province", d.province], ["District", d.district], ["Village", d.village], ["Coordinates", d.lat && d.lng ? `${d.lat}, ${d.lng}` : "—"], ["Boundary", d.boundaryFile || "—"]]} />
              <Review title="Documents" onEdit={() => setStep(3)} rows={REQUIRED_DOCUMENTS.map((doc) => [doc, d.documents[doc] || "Missing"])} />
              <div className="rounded-md border border-line bg-canvas p-4">
                <div className="font-medium">Payout wallet</div>
                {isConnected ? (
                  <p className="mt-1 text-muted">
                    Credits and 87% of every sale go to <span className="font-mono text-ink">{address}</span>.
                  </p>
                ) : (
                  <p className="mt-1 text-muted">
                    Connect the wallet that should receive credits and sale proceeds.{" "}
                    <button className="font-medium text-brand underline" onClick={openConnectModal}>Connect wallet</button>
                  </p>
                )}
              </div>
            </div>
          )}

          {error && <div role="alert" className="mt-5 rounded-md bg-danger-soft p-3 text-sm text-danger">{error}</div>}
          <div className="mt-6 flex justify-between gap-3 border-t border-line pt-5">
            <button className="btn-secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</button>
            {step < STEPS.length - 1 ? (
              <button className="btn-primary" onClick={next}>Continue to Next Step</button>
            ) : (
              <button className="btn-primary" disabled={!isConnected || !!busy} onClick={submit}>{busy ?? "Submit for Review"}</button>
            )}
          </div>
        </section>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Application Status</h2>
            <Badge>Draft</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">{savedAt ? `Draft saved ${savedAt}. You can come back and finish later.` : "Complete all steps and submit for review."}</p>
          <div className="mt-3 h-2 rounded-full bg-canvas"><div className="h-2 rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} /></div>
          <div className="mt-1 flex justify-between text-xs text-muted"><span>Step {step + 1} of {STEPS.length}</span><span>{pct}%</span></div>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold">Step Checklist</h2>
          <ol className="mt-3 space-y-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${completed[i] ? "bg-brand text-white" : i === step ? "ring-2 ring-brand" : "bg-canvas text-muted"}`}>
                  {completed[i] ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className="text-sm">
                  <span className={i === step ? "font-medium" : ""}>{s.title}</span>
                  <span className="block text-xs text-muted">{s.sub}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold">Project Summary</h2>
          <dl className="mt-3 space-y-2 text-sm">
            {[
              ["Project Name", d.name],
              ["Project Type", d.type],
              ["Location", [d.village, d.district, d.province].filter(Boolean).join(", ")],
              ["Land Area", d.areaHa && `${d.areaHa} ha`],
              ["Applicant", [d.firstName, d.lastName].filter(Boolean).join(" ")],
              ["Email", d.email],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted">{k}</dt>
                <dd className={`truncate text-right ${v ? "" : "italic text-muted/70"}`}>{v || "Not provided"}</dd>
              </div>
            ))}
          </dl>
          <button className="btn-secondary mt-4 w-full" disabled={!!busy} onClick={saveDraft}>{busy === "Saving draft…" ? busy : "Save Draft"}</button>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <div>
      <span className="label">{label}{required && <span className="text-danger"> *</span>}</span>
      {children}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

function FileRow({ label, hint, accept, value, error, onChange }: { label: string; hint: string; accept: string; value: string; error?: string; onChange: (file: File) => void }) {
  const [tooBig, setTooBig] = useState(false);
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-md border p-3 ${error ? "border-danger" : "border-line"}`}>
      <DocIcon className="h-5 w-5 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className={`truncate text-xs ${tooBig || error ? "text-danger" : "text-muted"}`}>
          {tooBig ? "File is larger than 10 MB" : error ? error : value || hint}
        </div>
      </div>
      {value && <CheckIcon className="h-4 w-4 text-brand" />}
      <label className="btn-secondary cursor-pointer px-3 py-1.5">
        {value ? "Replace" : "Choose File"}
        <input
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setTooBig(f.size > MAX_FILE);
            if (f.size <= MAX_FILE) onChange(f);
          }}
        />
      </label>
    </div>
  );
}

function Review({ title, rows, onEdit }: { title: string; rows: string[][]; onEdit: () => void }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <button className="text-sm text-brand underline" onClick={onEdit}>Edit</button>
      </div>
      <dl className="mt-2 divide-y divide-line rounded-md border border-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-3 py-2">
            <dt className="text-muted">{k}</dt>
            <dd className={`text-right ${v === "Missing" ? "text-warn" : ""}`}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
