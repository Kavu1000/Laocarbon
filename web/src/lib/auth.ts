"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "./supabase/client";

export type Role = "buyer" | "forest_owner" | "auditor" | "admin";
export type KycStatus = "not_submitted" | "pending" | "verified" | "rejected";

export type User = {
  id: string;
  email: string;
  fullName: string;
  orgName: string;
  role: Role;
  phone: string;
  website: string;
  bio: string;
  avatarUrl: string | null;
  wallet: string | null;
  kycStatus: KycStatus;
  suspended: boolean;
  createdAt: string;
};

export type ProfileRow = {
  id: string; full_name: string; org_name: string; role: Role; phone: string; website: string; bio: string;
  avatar_url: string | null; wallet: string | null; kyc_status: KycStatus; suspended?: boolean; created_at: string;
};

export const toUser = (p: ProfileRow, email: string): User => ({
  id: p.id, email, fullName: p.full_name, orgName: p.org_name, role: p.role, phone: p.phone, website: p.website,
  bio: p.bio, avatarUrl: p.avatar_url, wallet: p.wallet, kycStatus: p.kyc_status, suspended: !!p.suspended, createdAt: p.created_at,
});

export const ROLE_LABEL: Record<Role, string> = {
  buyer: "Buyer organisation",
  forest_owner: "Forest owner / Project developer",
  auditor: "Auditor",
  admin: "Administrator",
};

export const KYC_LABEL: Record<KycStatus, string> = {
  not_submitted: "Not verified",
  pending: "Verification pending",
  verified: "Verified organisation",
  rejected: "Verification rejected",
};

export const authConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export async function loadCurrentUser(): Promise<User | null> {
  if (!authConfigured) return null;
  const sb = supabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data, error } = await sb.from("profiles").select("*").eq("id", user.id).single<ProfileRow>();
  if (error || !data) return null;
  return toUser(data, user.email ?? "");
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["auth-me"], queryFn: loadCurrentUser, staleTime: 60_000 });

  useEffect(() => {
    if (!authConfigured) return;
    const { data: sub } = supabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        queryClient.invalidateQueries({ queryKey: ["auth-me"] });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  return {
    user: data ?? null,
    isLoading,
    refresh: () => queryClient.invalidateQueries({ queryKey: ["auth-me"] }),
    setUser: (u: User | null) => queryClient.setQueryData(["auth-me"], u),
    async logout() {
      await supabase().auth.signOut();
    },
  };
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; fields?: Record<string, string> };

export async function api<T>(url: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? `Request failed (${res.status})`, fields: data.fields };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Network error — check your connection and try again." };
  }
}

/** Maps Supabase Auth errors to messages that don't leak whether an email exists. */
export function authErrorMessage(message: string) {
  if (/invalid login credentials/i.test(message)) return "Incorrect email or password";
  if (/email not confirmed/i.test(message)) return "Please confirm your email first — check your inbox for the link.";
  if (/rate limit|too many/i.test(message)) return "Too many attempts. Please wait a few minutes and try again.";
  if (/already registered|already exists/i.test(message)) return "An account with this email already exists";
  return message;
}

/** Only allow same-site relative redirects after login. */
export function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/profile";
}
