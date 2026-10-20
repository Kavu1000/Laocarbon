"use client";

import { useEffect, type ReactNode } from "react";
import { CloseIcon } from "./icons";

export function StatCard({ label, value, unit, icon }: { label: string; value: ReactNode; unit?: string; icon: ReactNode }) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-brand-soft text-brand">{icon}</div>
      <div className="min-w-0">
        <div className="text-sm text-muted">{label}</div>
        <div className="truncate text-2xl font-semibold tabular-nums">{value}</div>
        {unit && <div className="text-xs text-muted">{unit}</div>}
      </div>
    </div>
  );
}

const TONES = {
  green: "bg-brand-soft text-brand",
  amber: "bg-warn-soft text-warn",
  red: "bg-danger-soft text-danger",
  gray: "bg-canvas text-muted border border-line",
} as const;

export function Badge({ tone = "gray", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white shadow-xl sm:rounded-xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-white px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-canvas" aria-label="Close">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

const PALETTES = [
  ["#cfe0d4", "#7fa58c", "#3f6b52", "#244a37"],
  ["#d9e4d2", "#8fac7d", "#4e7445", "#2d4a2a"],
  ["#d2e1e0", "#7fa5a0", "#3e6b66", "#22453f"],
  ["#e1e3d0", "#a3a97e", "#636b44", "#3b4228"],
];

/** Decorative forest landscape used where project photos will go once they're stored on IPFS. */
export function ForestArt({ seed, className = "" }: { seed: number; className?: string }) {
  const [sky, far, mid, near] = PALETTES[seed % PALETTES.length];
  return (
    <svg viewBox="0 0 320 140" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true">
      <rect width="320" height="140" fill={sky} />
      <path d={`M0 90 L${60 + (seed % 3) * 20} 38 L140 82 L210 30 L320 86 V140 H0z`} fill={far} />
      <path d="M0 110 Q60 80 120 104 T240 98 T320 104 V140 H0z" fill={mid} />
      <g fill={near}>
        {Array.from({ length: 22 }, (_, i) => {
          const x = i * 15 + ((seed * 7 + i * 13) % 9);
          const h = 18 + ((seed + i * 5) % 14);
          return <path key={i} d={`M${x} 140 L${x + 7} ${140 - h - 12} L${x + 14} 140z`} />;
        })}
      </g>
    </svg>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card px-6 py-12 text-center">
      <div className="font-medium">{title}</div>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}
