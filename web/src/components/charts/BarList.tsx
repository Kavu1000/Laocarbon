"use client";

import { CHART } from "./tokens";

const fmt = new Intl.NumberFormat("en-US");

/** Ranked magnitudes: label on the left, value on the right, one hue. Values are always visible. */
export function BarList({ items, unit = "tCO₂e", empty = "No retirements in this period" }: { items: { label: string; tons: number }[]; unit?: string; empty?: string }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  const max = Math.max(...items.map((i) => i.tons));
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.label} className="group" title={`${i.label}: ${fmt.format(i.tons)} ${unit}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{i.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">{fmt.format(i.tons)} <span className="font-normal text-muted">{unit}</span></span>
          </div>
          <div className="mt-1 h-2 rounded-r bg-transparent">
            <div className="h-full rounded-r transition-opacity group-hover:opacity-80" style={{ width: `${Math.max((i.tons / max) * 100, 1)}%`, background: CHART.single }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
