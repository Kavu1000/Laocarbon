"use client";

import { useQuery } from "@tanstack/react-query";
import { authConfigured } from "./auth";
import type { Boundary } from "./geo";
import { supabase } from "./supabase/client";

export const PROJECT_TYPES = [
  "REDD+ (Avoided Deforestation)",
  "Afforestation / Reforestation",
  "Sustainable Forest Management",
  "Agroforestry",
  "Other",
] as const;

export const PROVINCES = [
  "Attapeu", "Bokeo", "Bolikhamxai", "Champasak", "Houaphanh", "Khammouane", "Luang Namtha",
  "Luang Prabang", "Oudomxay", "Phongsaly", "Salavan", "Savannakhet", "Vientiane Capital",
  "Vientiane", "Xaisomboun", "Xayabouly", "Xekong", "Xiangkhouang",
] as const;

export const REQUIRED_DOCUMENTS = [
  "Project Design Document (PDD)",
  "Validation Report",
  "Monitoring Report (Latest)",
  "Benefit Sharing Plan",
  "Community Consultation Records",
] as const;
export const BOUNDARY_DOC = "Project Boundary";

export type ProjectStatus = "draft" | "pending_review" | "in_validation" | "changes_requested" | "approved" | "rejected";

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  in_validation: "In Validation",
  changes_requested: "Changes Requested",
  approved: "Approved",
  rejected: "Rejected",
};
export const STATUS_TONE: Record<ProjectStatus, "green" | "amber" | "red" | "gray"> = {
  draft: "gray",
  pending_review: "gray",
  in_validation: "amber",
  changes_requested: "amber",
  approved: "green",
  rejected: "red",
};

/** Columns visible to everyone via the public_projects view. */
export type PublicProject = {
  id: number;
  name: string;
  company: string;
  type: string;
  description: string;
  area_ha: number | null;
  estimated_credits: number | null;
  credit_period: string;
  standard: string;
  province: string;
  district: string;
  co_benefits: string[];
  status: ProjectStatus;
  ipfs_cid: string | null;
  document_types: string[];
  lat: number | null;
  lng: number | null;
  boundary: Boundary | null;
};

/** Full row, readable by the project owner and auditors only. */
export type ProjectRow = Omit<PublicProject, "document_types"> & {
  owner_id: string | null;
  village: string;
  contact_first: string;
  contact_last: string;
  contact_email: string;
  contact_phone: string;
  payout_wallet: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectInput = Partial<Omit<ProjectRow, "id" | "owner_id" | "status" | "created_at" | "updated_at" | "submitted_at" | "ipfs_cid">>;

export type ProjectDocument = { id: number; project_id: number; doc_type: string; file_name: string; storage_path: string; size_bytes: number; uploaded_at: string };
export type ReviewNote = { id: number; project_id: number; decision: string; note: string; created_at: string };

const unwrap = <T,>({ data, error }: { data: T | null; error: { message: string } | null }) => {
  if (error) throw new Error(error.message);
  return data as T;
};

export function usePublicProjects() {
  return useQuery({
    queryKey: ["public-projects"],
    enabled: authConfigured,
    staleTime: 60_000,
    queryFn: async () => unwrap<PublicProject[]>(await supabase().from("public_projects").select("*").order("id")),
  });
}

export function useMyProjects(userId?: string) {
  return useQuery({
    queryKey: ["my-projects", userId],
    enabled: authConfigured && !!userId,
    queryFn: async () =>
      unwrap<ProjectRow[]>(await supabase().from("projects").select("*").eq("owner_id", userId!).order("created_at", { ascending: false })),
  });
}

export function useReviewQueue(enabled: boolean) {
  return useQuery({
    queryKey: ["review-queue"],
    enabled: authConfigured && enabled,
    queryFn: async () =>
      unwrap<ProjectRow[]>(await supabase().from("projects").select("*").neq("status", "draft").order("submitted_at", { ascending: false })),
  });
}

export function useProjectDetail(projectId?: number) {
  return useQuery({
    queryKey: ["project-detail", projectId],
    enabled: authConfigured && projectId !== undefined,
    queryFn: async () => {
      const [docs, notes] = await Promise.all([
        supabase().from("project_documents").select("*").eq("project_id", projectId!).order("doc_type"),
        supabase().from("review_notes").select("id, project_id, decision, note, created_at").eq("project_id", projectId!).order("created_at", { ascending: false }),
      ]);
      return { documents: unwrap<ProjectDocument[]>(docs), notes: unwrap<ReviewNote[]>(notes) };
    },
  });
}

export async function saveProject(ownerId: string, input: ProjectInput, status: "draft" | "pending_review", id?: number) {
  const row = { ...input, owner_id: ownerId, status, ...(status === "pending_review" && { submitted_at: new Date().toISOString() }) };
  const q = id
    ? supabase().from("projects").update(row).eq("id", id).select("id").single()
    : supabase().from("projects").insert(row).select("id").single();
  return unwrap<{ id: number }>(await q).id;
}

export async function uploadDocument(ownerId: string, projectId: number, docType: string, file: File) {
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `${ownerId}/${projectId}/${Date.now()}-${safeName}`;
  const sb = supabase();
  const { error } = await sb.storage.from("project-documents").upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (error) throw new Error(`${docType}: ${error.message}`);
  await sb.from("project_documents").delete().eq("project_id", projectId).eq("doc_type", docType);
  unwrap(await sb.from("project_documents").insert({ project_id: projectId, doc_type: docType, file_name: file.name, storage_path: path, size_bytes: file.size }));
}

export async function documentUrl(path: string) {
  const { data, error } = await supabase().storage.from("project-documents").createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function reviewProject(projectId: number, auditorId: string, status: ProjectStatus, decision: string, note: string, extra: Partial<Pick<ProjectRow, "payout_wallet" | "ipfs_cid">> = {}) {
  unwrap(await supabase().from("projects").update({ ...extra, status }).eq("id", projectId));
  unwrap(await supabase().from("review_notes").insert({ project_id: projectId, auditor_id: auditorId, decision, note }));
}

export function placeholderCid(id: number) {
  return `bafkreilaocarbon${id.toString().padStart(4, "0")}`;
}

// ---------------------------------------------------------------- verification

export type VerificationMethod = "document_review" | "satellite_analysis" | "field_visit";
export type VerificationResult = "passed" | "flagged" | "failed";
export type VerificationEvent = {
  id: number;
  project_id: number;
  method: VerificationMethod;
  result: VerificationResult;
  summary: string;
  imagery_date: string | null;
  evidence_url: string | null;
  created_at: string;
  auditor_name: string;
  auditor_org: string;
};

export const METHOD_LABEL: Record<VerificationMethod, string> = {
  document_review: "Document review",
  satellite_analysis: "Satellite analysis",
  field_visit: "Field visit",
};

export function useVerification(projectId?: number) {
  return useQuery({
    queryKey: ["verification", projectId],
    enabled: authConfigured && projectId !== undefined,
    queryFn: async () =>
      unwrap<VerificationEvent[]>(
        await supabase().from("public_verification_events").select("*").eq("project_id", projectId!).order("created_at", { ascending: false }),
      ),
  });
}

export async function recordVerification(e: {
  projectId: number;
  auditorId: string;
  method: VerificationMethod;
  result: VerificationResult;
  summary: string;
  imageryDate?: string;
  evidenceUrl?: string;
}) {
  unwrap(
    await supabase().from("verification_events").insert({
      project_id: e.projectId,
      auditor_id: e.auditorId,
      method: e.method,
      result: e.result,
      summary: e.summary,
      imagery_date: e.imageryDate || null,
      evidence_url: e.evidenceUrl || null,
    }),
  );
}

export function usePublicProject(id: number) {
  return useQuery({
    queryKey: ["public-project", id],
    enabled: authConfigured && Number.isFinite(id),
    queryFn: async () => unwrap<PublicProject | null>(await supabase().from("public_projects").select("*").eq("id", id).maybeSingle()),
  });
}
