"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { authConfigured } from "@/lib/auth";
import { CheckIcon, LeafIcon } from "./icons";
import { ForestArt } from "./ui";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-5xl overflow-hidden rounded-xl border border-line bg-white lg:grid-cols-2">
      <div className="relative hidden min-h-[640px] flex-col justify-between overflow-hidden bg-brand p-10 text-white lg:flex">
        <ForestArt seed={2} className="absolute inset-x-0 bottom-0 h-56 w-full opacity-40" />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <LeafIcon className="h-8 w-8" />
            <span className="text-xl font-bold">LaoCarbon</span>
          </div>
          <h2 className="mt-10 text-3xl font-bold leading-tight">Forests Today.<br />A Cleaner Tomorrow.</h2>
          <ul className="mt-8 space-y-4 text-sm text-white/90">
            {[
              "Verified forestry carbon credits from across Lao PDR",
              "Every purchase is burned on-chain — no resale, no double counting",
              "Soulbound retirement certificates for your organisation profile",
              "87% of every sale goes directly to forest owners and communities",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="p-6 sm:p-10">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
        <div className="mt-6">
          {authConfigured ? (
            children
          ) : (
            <div role="alert" className="rounded-md bg-warn-soft p-4 text-sm text-warn">
              Accounts aren't set up yet: add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to <code>web/.env.local</code> and restart the dev server.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function TextField({ label, error, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  return (
    <div>
      <label className="label" htmlFor={props.id}>{label}</label>
      <input className={`input ${error ? "border-danger" : ""}`} aria-invalid={!!error} {...props} />
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function PasswordField({ label, error, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="label" htmlFor={props.id}>{label}</label>
      <div className="relative">
        <input className={`input pr-16 ${error ? "border-danger" : ""}`} type={show ? "text" : "password"} aria-invalid={!!error} {...props} />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-muted hover:bg-canvas"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <div role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">{children}</div>;
}
