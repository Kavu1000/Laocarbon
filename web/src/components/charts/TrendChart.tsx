"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART } from "./tokens";

type Point = { t: string; tons: number; usd: number };
type Metric = "tons" | "usd";

const num = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const usdFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const tonsFmt = new Intl.NumberFormat("en-US");

function tickLabel(t: string, bucket: "day" | "month") {
  const d = new Date(bucket === "day" ? `${t}T00:00:00Z` : `${t}-01T00:00:00Z`);
  return d.toLocaleDateString("en-GB", bucket === "day" ? { day: "numeric", month: "short", timeZone: "UTC" } : { month: "short", year: "2-digit", timeZone: "UTC" });
}

/** One measure at a time on one axis — tons or USDT — never both (no dual axes). */
export function TrendChart({ data, bucket }: { data: Point[]; bucket: "day" | "month" }) {
  const [metric, setMetric] = useState<Metric>("tons");
  const fmt = (v: number) => (metric === "tons" ? `${tonsFmt.format(v)} tCO₂e` : usdFmt.format(v));
  const total = data.reduce((s, p) => s + p[metric], 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted">
          Total in period: <span className="font-semibold text-ink">{fmt(total)}</span>
        </div>
        <div className="flex overflow-hidden rounded-md border border-line text-xs font-medium" role="group" aria-label="Measure">
          {(["tons", "usd"] as const).map((m) => (
            <button key={m} onClick={() => setMetric(m)} aria-pressed={metric === m} className={`px-3 py-1.5 ${metric === m ? "bg-brand text-white" : "bg-white hover:bg-canvas"}`}>
              {m === "tons" ? "tCO₂e retired" : "USDT volume"}
            </button>
          ))}
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART.single} stopOpacity={0.22} />
                <stop offset="100%" stopColor={CHART.single} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis
              dataKey="t"
              tickFormatter={(t) => tickLabel(t, bucket)}
              tick={{ fill: CHART.muted, fontSize: 11 }}
              axisLine={{ stroke: CHART.axis }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              tickFormatter={(v) => (metric === "usd" ? `$${num.format(v)}` : num.format(v))}
              tick={{ fill: CHART.muted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip
              cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
              contentStyle={{ borderRadius: 8, border: `1px solid ${CHART.grid}`, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
              labelFormatter={(t) => tickLabel(String(t), bucket)}
              formatter={(v) => [fmt(Number(v)), metric === "tons" ? "Retired" : "Volume"]}
            />
            <Area
              type="linear"
              dataKey={metric}
              stroke={CHART.single}
              strokeWidth={2}
              fill="url(#trend-fill)"
              activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
