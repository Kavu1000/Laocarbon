"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useContracts } from "@/lib/contracts";
import { actionTone, describeAction, type GovernanceResponse } from "@/lib/governance";
import { Badge, Empty } from "./ui";

type Row = {
  key: string;
  time: number;
  source: "off-chain" | "on-chain";
  actor: string;
  role: string;
  text: React.ReactNode;
  tone: "green" | "amber" | "red" | "gray";
  note?: string;
  tx?: string;
};

const short = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;
const fmt = (ms: number) => new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function useGovernance() {
  const c = useContracts();
  return useQuery({
    queryKey: ["governance", c.chainId],
    queryFn: async (): Promise<GovernanceResponse> => {
      const res = await fetch(`/api/governance?chainId=${c.chainId}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Governance log unavailable (${res.status})`);
      return res.json();
    },
    refetchInterval: 30_000,
  });
}

/** Unified, newest-first trail of privileged actions: registry decisions (off-chain) and permission/registration events (on-chain). */
export function GovernanceLog({ limit }: { limit?: number }) {
  const { data, isLoading, error } = useGovernance();
  const [filter, setFilter] = useState<"all" | "off-chain" | "on-chain">("all");

  if (error) return <Empty title="Governance log unavailable">{error.message}</Empty>;
  if (isLoading || !data) return <div className="h-40 animate-pulse rounded-lg bg-white" />;

  const rows: Row[] = [
    ...data.offchain.map((e) => ({
      key: `g${e.id}`,
      time: Date.parse(e.created_at),
      source: "off-chain" as const,
      actor: e.actor_name,
      role: e.actor_role,
      tone: actionTone(e),
      text: (
        <>
          {describeAction(e.action)}{" "}
          {e.target_type === "project" ? <Link href={`/projects/${e.target_id}`} className="font-medium hover:underline">{e.target_label}</Link> : <span className="font-medium">{e.target_label}</span>}
          {e.action === "user.role_changed" && <> from <b>{String(e.details.from)}</b> to <b>{String(e.details.to)}</b></>}
          {typeof e.details.result === "string" && <> — <b>{e.details.result}</b></>}
        </>
      ),
      note: typeof e.details.reason === "string" && e.details.reason ? `Reason: ${e.details.reason}` : typeof e.details.summary === "string" ? e.details.summary : undefined,
    })),
    ...data.roleEvents.map((e) => ({
      key: `r${e.txHash}${e.role}${e.account}`,
      time: e.timestamp * 1000,
      source: "on-chain" as const,
      actor: short(e.sender),
      role: "contract admin",
      tone: (e.granted ? "green" : "red") as Row["tone"],
      text: <>{e.granted ? "Granted" : "Revoked"} <b>{e.role}</b> on {e.contract} {e.granted ? "to" : "from"} <span className="font-mono">{short(e.account)}</span></>,
      tx: e.txHash,
    })),
    ...data.registrations.map((r) => ({
      key: `p${r.project_id}`,
      time: Number.NaN,
      source: "on-chain" as const,
      actor: "Registrar wallet",
      role: "registrar",
      tone: "green" as const,
      text: <>Registered <Link href={`/projects/${r.project_id}`} className="font-medium hover:underline">project #{r.project_id}</Link> on-chain for owner <span className="font-mono">{short(r.forest_owner)}</span></>,
      note: `Block ${r.block_number}`,
      tx: r.tx_hash,
    })),
  ]
    .filter((r) => filter === "all" || r.source === filter)
    .sort((a, b) => (Number.isNaN(b.time) ? -1 : Number.isNaN(a.time) ? 1 : b.time - a.time))
    .slice(0, limit);

  return (
    <div>
      <div className="mb-3 flex overflow-hidden rounded-md border border-line bg-white text-sm w-fit" role="group" aria-label="Source">
        {(["all", "off-chain", "on-chain"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={`px-3 py-1.5 ${filter === f ? "bg-brand text-white" : "hover:bg-canvas"}`}>
            {f === "all" ? "All" : f === "off-chain" ? "Registry decisions" : "On-chain permissions"}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty title="No privileged actions yet" />
      ) : (
        <ol className="card divide-y divide-line">
          {rows.map((r) => (
            <li key={r.key} className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${r.tone === "green" ? "bg-brand" : r.tone === "red" ? "bg-danger" : r.tone === "amber" ? "bg-warn" : "bg-muted"}`} />
              <div className="min-w-0 flex-1">
                <div>{r.text}</div>
                {r.note && <div className="mt-0.5 text-xs text-muted">{r.note}</div>}
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <span>{r.actor}</span>
                  <Badge>{r.role}</Badge>
                  <Badge tone={r.source === "on-chain" ? "green" : "gray"}>{r.source}</Badge>
                  {r.tx && <span className="font-mono" title={r.tx}>tx {r.tx.slice(0, 10)}…</span>}
                </div>
              </div>
              <span className="whitespace-nowrap text-xs text-muted">{Number.isNaN(r.time) ? "" : fmt(r.time)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
