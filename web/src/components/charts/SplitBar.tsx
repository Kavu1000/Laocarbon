"use client";

import { useState } from "react";
import { CHART } from "./tokens";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Part-to-whole of a single total: one stacked bar, 2px gaps, every segment labelled below. */
export function SplitBar({ parts }: { parts: { label: string; value: number; note: string }[] }) {
  const [hover, setHover] = useState<number>();
  const total = parts.reduce((s, p) => s + p.value, 0);
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  return (
    <div>
      <div className="relative flex h-6 gap-0.5" onMouseLeave={() => setHover(undefined)}>
        {total === 0 ? (
          <div className="h-full w-full rounded bg-canvas" />
        ) : (
          parts.map((p, i) => (
            <div
              key={p.label}
              onMouseEnter={() => setHover(i)}
              className="h-full first:rounded-l last:rounded-r transition-opacity"
              style={{ width: `${pct(p.value)}%`, background: CHART.series[i], opacity: hover === undefined || hover === i ? 1 : 0.45 }}
              aria-label={`${p.label}: ${usd.format(p.value)} (${pct(p.value).toFixed(0)}%)`}
            />
          ))
        )}
        {hover !== undefined && total > 0 && (
          <div className="pointer-events-none absolute -top-12 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-white px-2.5 py-1.5 text-xs shadow">
            <span className="font-semibold">{parts[hover].label}</span> · {usd.format(parts[hover].value)} ({pct(parts[hover].value).toFixed(0)}%)
          </div>
        )}
      </div>
      <ul className="mt-4 space-y-2.5">
        {parts.map((p, i) => (
          <li key={p.label} className="flex items-start gap-2.5 text-sm" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(undefined)}>
            <span className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ background: CHART.series[i] }} />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{p.label}</span> <span className="text-muted">{pct(p.value).toFixed(0)}%</span>
              <span className="block text-xs text-muted">{p.note}</span>
            </span>
            <span className="font-semibold tabular-nums">{usd.format(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
