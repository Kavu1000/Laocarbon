"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { zeroAddress, type Address } from "viem";
import { usePublicClient } from "wagmi";
import { carbonTokenAbi, marketplaceAbi, useContracts } from "@/lib/contracts";
import { fmtDate, fmtTons, fmtUsd, shortAddr, splitRevenue } from "@/lib/format";
import { useIndexed, useListings, useOffsets } from "@/lib/hooks";
import { usePublicProjects } from "@/lib/projects";
import { supabase } from "@/lib/supabase/client";
import { Badge } from "../ui";

type Kind = "bought" | "burned" | "sold" | "issued" | "escrow_in" | "escrow_out" | "received" | "sent";
type Activity = { key: string; time: number; kind: Kind; tons: bigint; projectId?: bigint; usd?: bigint; counterparty?: string; txHash: string; certificateId?: bigint };

const KIND: Record<Kind, { label: string; tone: "green" | "amber" | "red" | "gray"; sign: "+" | "−" | "" }> = {
  bought: { label: "Bought & burned", tone: "green", sign: "" },
  burned: { label: "Burned", tone: "red", sign: "−" },
  sold: { label: "Sold", tone: "green", sign: "" },
  issued: { label: "Credits issued", tone: "green", sign: "+" },
  escrow_in: { label: "Listed (to escrow)", tone: "gray", sign: "−" },
  escrow_out: { label: "Withdrawn from escrow", tone: "gray", sign: "+" },
  received: { label: "Received", tone: "gray", sign: "+" },
  sent: { label: "Sent", tone: "gray", sign: "−" },
};

/** Everything that happened to this wallet's carbon credits, newest first. */
export function History({ wallet }: { wallet: Address }) {
  const c = useContracts();
  const client = usePublicClient({ chainId: c.chainId });
  const indexed = useIndexed(c.chainId);
  const { data: projects = [] } = usePublicProjects();
  const { data: offsets = [] } = useOffsets(wallet);
  const { listings } = useListings();
  const myListingIds = listings.filter((l) => l.seller.toLowerCase() === wallet.toLowerCase()).map((l) => l.listingId);
  const nameOf = (id?: bigint) => (id === undefined ? "—" : projects.find((p) => p.id === Number(id))?.name ?? `Project #${id}`);

  // Sales: retirements made by others against this wallet's listings.
  const sales = useQuery({
    queryKey: ["sales", c.chainId, wallet.toLowerCase(), myListingIds.join(","), indexed],
    enabled: c.ready && !!client,
    queryFn: async (): Promise<Activity[]> => {
      if (!myListingIds.length || !c.ready || !client) return [];
      if (indexed) {
        const { data, error } = await supabase()
          .from("chain_offsets")
          .select("certificate_id, buyer, project_id, tons, total_paid, retired_at, tx_hash")
          .eq("chain_id", c.chainId)
          .in("listing_id", myListingIds.map(Number));
        if (error) throw new Error(error.message);
        return data.map((r) => ({
          key: `sale-${r.certificate_id}`, time: Date.parse(r.retired_at) / 1000, kind: "sold" as const, tons: BigInt(r.tons),
          projectId: BigInt(r.project_id), usd: splitRevenue(BigInt(r.total_paid)).owner, counterparty: r.buyer, txHash: r.tx_hash,
        }));
      }
      const ids = new Set(myListingIds.map(String));
      const logs = await client.getContractEvents({ address: c.marketplace, abi: marketplaceAbi, eventName: "CarbonOffset", fromBlock: 0n });
      return logs
        .filter((l) => ids.has(String(l.args.listingId)))
        .map((l) => ({
          key: `sale-${l.args.certificateId}`, time: Number(l.args.timestamp), kind: "sold" as const, tons: l.args.tons!,
          projectId: l.args.projectId, usd: splitRevenue(l.args.totalPaid!).owner, counterparty: l.args.buyer, txHash: l.transactionHash,
        }));
    },
  });

  // Token movements (issuance, escrow in/out, transfers). Burns are covered by the offset records.
  const transfers = useQuery({
    queryKey: ["credit-transfers", c.chainId, wallet.toLowerCase()],
    enabled: c.ready && !!client,
    queryFn: async (): Promise<Activity[]> => {
      if (!c.ready || !client) return [];
      const [incoming, outgoing] = await Promise.all([
        client.getContractEvents({ address: c.carbonToken, abi: carbonTokenAbi, eventName: "Transfer", args: { to: wallet }, fromBlock: 0n }),
        client.getContractEvents({ address: c.carbonToken, abi: carbonTokenAbi, eventName: "Transfer", args: { from: wallet }, fromBlock: 0n }),
      ]);
      const market = c.marketplace.toLowerCase();
      const blocks = new Map<bigint, number>();
      await Promise.all(
        [...new Set([...incoming, ...outgoing].map((l) => l.blockNumber))].map(async (n) =>
          blocks.set(n, Number((await client.getBlock({ blockNumber: n })).timestamp)),
        ),
      );
      const rows: Activity[] = [];
      for (const l of incoming) {
        const from = l.args.from!.toLowerCase();
        const kind: Kind = from === zeroAddress ? "issued" : from === market ? "escrow_out" : "received";
        rows.push({ key: `in-${l.transactionHash}-${l.logIndex}`, time: blocks.get(l.blockNumber)!, kind, tons: l.args.value!, counterparty: kind === "received" ? from : undefined, txHash: l.transactionHash });
      }
      for (const l of outgoing) {
        const to = l.args.to!.toLowerCase();
        if (to === zeroAddress) continue;
        const kind: Kind = to === market ? "escrow_in" : "sent";
        rows.push({ key: `out-${l.transactionHash}-${l.logIndex}`, time: blocks.get(l.blockNumber)!, kind, tons: l.args.value!, counterparty: kind === "sent" ? to : undefined, txHash: l.transactionHash });
      }
      return rows;
    },
  });

  const items = useMemo(() => {
    const own: Activity[] = offsets.map((o) => ({
      key: `cert-${o.certificateId}`,
      time: Number(o.timestamp),
      kind: o.listingId === 0n ? "burned" : "bought",
      tons: o.tons,
      projectId: o.projectId,
      usd: o.totalPaid > 0n ? o.totalPaid : undefined,
      txHash: o.txHash,
      certificateId: o.certificateId,
    }));
    return [...own, ...(sales.data ?? []), ...(transfers.data ?? [])].sort((a, b) => b.time - a.time);
  }, [offsets, sales.data, transfers.data]);

  const loading = sales.isLoading || transfers.isLoading;

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h3 className="font-semibold">Activity History</h3>
        <p className="text-sm text-muted">Every purchase, burn, sale and credit movement for {shortAddr(wallet)} — all verifiable on-chain.</p>
      </div>
      {loading && !items.length ? (
        <p className="p-5 text-sm text-muted">Loading history…</p>
      ) : !items.length ? (
        <p className="p-5 text-sm text-muted">No activity yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-canvas text-left text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Activity</th>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 text-right font-medium">Value</th>
                <th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => {
                const k = KIND[a.kind];
                return (
                  <tr key={a.key} className="border-t border-line">
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{fmtDate(a.time)}</td>
                    <td className="px-4 py-3"><Badge tone={k.tone}>{k.label}</Badge></td>
                    <td className="px-4 py-3">{nameOf(a.projectId)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{k.sign}{fmtTons(a.tons)} tCO₂e</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {a.usd !== undefined ? `${a.kind === "sold" ? "+" : ""}${fmtUsd(a.usd)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {a.certificateId !== undefined && <>Certificate #{a.certificateId.toString()} · </>}
                      {a.counterparty && <>{a.kind === "sold" ? "Buyer" : a.kind === "sent" ? "To" : "From"} {shortAddr(a.counterparty)} · </>}
                      <span className="font-mono" title={a.txHash}>tx {a.txHash.slice(0, 10)}…</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
