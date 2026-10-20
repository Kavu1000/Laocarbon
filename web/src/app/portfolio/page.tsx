"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useMemo, useState } from "react";
import { parseUnits, type Address } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { BuildingIcon, DocIcon, FlameIcon, LeafIcon, ShieldIcon } from "@/components/icons";
import { CertificateModal } from "@/components/CertificateModal";
import { Badge, StatCard } from "@/components/ui";
import { carbonTokenAbi, marketplaceAbi, useContracts, USDT_DECIMALS } from "@/lib/contracts";
import { errMessage, fmtDate, fmtTons, fmtUsd, shortAddr } from "@/lib/format";
import { useAfterTx, useListings, useOffsets, useRegisteredProjects, type Offset } from "@/lib/hooks";
import { usePublicProjects } from "@/lib/projects";

type Tab = "certificates" | "seller";

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { data: projects = [] } = usePublicProjects();
  const { data: offsets, isLoading } = useOffsets(address);
  const { data: registered } = useRegisteredProjects();
  const [tab, setTab] = useState<Tab>("certificates");
  const [viewing, setViewing] = useState<Offset>();

  const nameOf = (id: bigint | number) => projects.find((p) => p.id === Number(id))?.name ?? `Project #${id}`;
  const ownsProjects = !!address && [...(registered?.values() ?? [])].some((r) => r.forestOwner.toLowerCase() === address.toLowerCase());

  const list = offsets ?? [];
  const totalTons = list.reduce((s, o) => s + o.tons, 0n);
  const totalSpent = list.reduce((s, o) => s + o.totalPaid, 0n);
  const allocation = useMemo(() => {
    const m = new Map<number, bigint>();
    for (const o of list) m.set(Number(o.projectId), (m.get(Number(o.projectId)) ?? 0n) + o.tons);
    return [...m.entries()].sort((a, b) => Number(b[1] - a[1]));
  }, [list]);

  if (!isConnected || !address) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Portfolio</h1>
        <p className="mt-2 text-muted">Connect your wallet to see your retirement certificates and offset history.</p>
        <button className="btn-primary mt-6" onClick={openConnectModal}>Connect Wallet</button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Portfolio</h1>
      <p className="mt-1 text-muted">Your carbon offsets, certificates and impact across Lao PDR.</p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card flex items-center gap-4 p-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-lg font-semibold text-white">
            {address.slice(2, 3).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium">Organisation wallet</div>
            <div className="truncate font-mono text-sm text-muted" title={address}>{shortAddr(address)}</div>
            <Badge tone="green">Connected</Badge>
          </div>
        </div>
        <StatCard label="Credits Retired" value={fmtTons(totalTons)} unit="tCO₂e" icon={<FlameIcon className="h-5 w-5" />} />
        <StatCard label="Total Spent" value={fmtUsd(totalSpent)} unit="USDT" icon={<span className="text-lg font-semibold">$</span>} />
        <StatCard label="Certificates" value={list.length} unit={`${allocation.length} projects supported`} icon={<ShieldIcon className="h-5 w-5" />} />
      </div>

      <div className="mt-6 flex gap-1 border-b border-line">
        <TabButton active={tab === "certificates"} onClick={() => setTab("certificates")}>Retirement Certificates</TabButton>
        {ownsProjects && <TabButton active={tab === "seller"} onClick={() => setTab("seller")}>My Projects (Seller)</TabButton>}
      </div>

      {tab === "seller" && ownsProjects ? (
        <SellerPanel address={address} />
      ) : (
        <div className="mt-5 grid gap-6 xl:grid-cols-[1fr_340px]">
          <div className="card overflow-hidden">
            {isLoading ? (
              <div className="p-6 text-muted">Loading on-chain offsets…</div>
            ) : list.length === 0 ? (
              <div className="p-10 text-center">
                <div className="font-medium">No offsets yet</div>
                <p className="mt-1 text-sm text-muted">Buy & offset credits on the Marketplace to receive your first certificate.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="bg-canvas text-left text-muted">
                    <tr>
                      <th className="px-4 py-3 font-medium">Certificate</th>
                      <th className="px-4 py-3 font-medium">Project</th>
                      <th className="px-4 py-3 text-right font-medium">Retired</th>
                      <th className="px-4 py-3 text-right font-medium">Paid</th>
                      <th className="px-4 py-3 font-medium">Retired at</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((o) => (
                      <tr key={o.certificateId.toString()} className="border-t border-line">
                        <td className="px-4 py-3 font-medium">#{o.certificateId.toString()}</td>
                        <td className="px-4 py-3">{nameOf(o.projectId)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtTons(o.tons)} tCO₂e</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtUsd(o.totalPaid)}</td>
                        <td className="px-4 py-3 text-muted">{fmtDate(o.timestamp)}</td>
                        <td className="px-4 py-3 text-right">
                          <button className="btn-secondary px-3 py-1.5" onClick={() => setViewing(o)}>View</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="card p-5">
              <h2 className="font-semibold">Impact by Project</h2>
              <p className="text-sm text-muted">Share of your retired tCO₂e</p>
              {allocation.length === 0 ? (
                <p className="mt-4 text-sm text-muted">Nothing retired yet.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {allocation.map(([id, tons]) => {
                    const pct = Number((tons * 1000n) / totalTons) / 10;
                    return (
                      <li key={id}>
                        <div className="flex justify-between text-sm">
                          <span className="truncate pr-2">{nameOf(id)}</span>
                          <span className="tabular-nums text-muted">{pct.toFixed(1)}%</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-canvas">
                          <div className="h-2 rounded-full bg-brand" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="card p-5">
              <h2 className="flex items-center gap-2 font-semibold"><LeafIcon className="h-4 w-4 text-brand" /> Carbon Impact</h2>
              <div className="mt-2 text-2xl font-semibold tabular-nums">{fmtTons(totalTons)} tCO₂e</div>
              <p className="text-sm text-muted">
                ≈ {fmtTons(Math.round(Number(totalTons) * 45))} tree-years of CO₂ uptake (avg. ~22 kg CO₂ per mature tree per year).
              </p>
            </div>
          </div>
        </div>
      )}

      {viewing && <CertificateModal offset={viewing} projectName={nameOf(viewing.projectId)} onClose={() => setViewing(undefined)} />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium ${active ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function SellerPanel({ address }: { address: Address }) {
  const c = useContracts();
  const { data: projects = [] } = usePublicProjects();
  const { data: registered } = useRegisteredProjects();
  const { listings } = useListings();
  const client = usePublicClient({ chainId: c.chainId });
  const { writeContractAsync } = useWriteContract();
  const afterTx = useAfterTx();

  const mine = [...(registered?.entries() ?? [])].filter(([, r]) => r.forestOwner.toLowerCase() === address.toLowerCase());
  const myListings = listings.filter((l) => l.seller.toLowerCase() === address.toLowerCase());

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: c.ready ? c.carbonToken : undefined,
    abi: carbonTokenAbi,
    functionName: "balanceOf",
    args: [address],
    chainId: c.chainId,
  });

  const [projectId, setProjectId] = useState(mine[0]?.[0]?.toString() ?? "");
  const [price, setPrice] = useState("8.00");
  const [tons, setTons] = useState("");
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  async function tx(label: string, fn: () => Promise<`0x${string}`>) {
    if (!client) return;
    setBusy(label);
    setError(undefined);
    try {
      const hash = await fn();
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");
      return true;
    } catch (e) {
      setError(errMessage(e));
      return false;
    } finally {
      setBusy(undefined);
    }
  }

  async function createListing() {
    if (!c.ready) return;
    const amount = BigInt(tons || "0");
    const pid = BigInt(projectId || mine[0]?.[0] || 0);
    const ok =
      (await tx("Approving credits…", () =>
        writeContractAsync({ address: c.carbonToken, abi: carbonTokenAbi, functionName: "approve", args: [c.marketplace, amount] }),
      )) &&
      (await tx("Creating listing…", () =>
        writeContractAsync({
          address: c.marketplace,
          abi: marketplaceAbi,
          functionName: "createListing",
          args: [pid, parseUnits(price, USDT_DECIMALS), amount],
        }),
      ));
    if (ok) {
      setTons("");
      refetchBalance();
      afterTx();
    }
  }

  async function cancel(listingId: bigint) {
    if (!c.ready) return;
    const ok = await tx("Cancelling…", () =>
      writeContractAsync({ address: c.marketplace, abi: marketplaceAbi, functionName: "cancelListing", args: [listingId] }),
    );
    if (ok) {
      refetchBalance();
      afterTx();
    }
  }

  const nameOf = (id: bigint | number) => projects.find((p) => p.id === Number(id))?.name ?? `Project #${id}`;
  const amount = /^\d+$/.test(tons) ? BigInt(tons) : 0n;
  const validPrice = /^\d+(\.\d{1,6})?$/.test(price) && Number(price) > 0;

  return (
    <div className="mt-5 grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="card overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-semibold">My Listings</h2>
          <p className="text-sm text-muted">Credits held in marketplace escrow. Each sale burns them automatically.</p>
        </div>
        {myListings.length === 0 ? (
          <p className="p-5 text-sm text-muted">No listings yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-canvas text-left text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Listing</th>
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 text-right font-medium">Price</th>
                  <th className="px-4 py-3 text-right font-medium">Remaining</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {myListings.map((l) => (
                  <tr key={l.listingId.toString()} className="border-t border-line">
                    <td className="px-4 py-3">#{l.listingId.toString()}</td>
                    <td className="px-4 py-3">{nameOf(l.projectId)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtUsd(l.pricePerTon)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {l.available > 0n ? `${fmtTons(l.available)} tCO₂e` : <Badge>Closed</Badge>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {l.available > 0n && (
                        <button className="btn-secondary px-3 py-1.5" disabled={!!busy} onClick={() => cancel(l.listingId)}>
                          Withdraw
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><BuildingIcon className="h-4 w-4" /> List Credits for Sale</h2>
        <p className="mt-1 text-sm text-muted">
          Wallet balance: <span className="font-medium text-ink">{fmtTons(balance ?? 0n)} tCO₂e</span>
        </p>
        <label className="label mt-4" htmlFor="sp">Project</label>
        <select id="sp" className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {mine.map(([id]) => <option key={id} value={id}>{nameOf(id)}</option>)}
        </select>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="pr">Price (USDT / tCO₂e)</label>
            <input id="pr" className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="tn">Amount (tCO₂e)</label>
            <input id="tn" className="input" inputMode="numeric" value={tons} onChange={(e) => setTons(e.target.value.replace(/[^\d]/g, ""))} />
          </div>
        </div>
        {amount > (balance ?? 0n) && <p className="mt-2 text-sm text-danger">Exceeds your wallet balance.</p>}
        {error && <div className="mt-3 rounded-md bg-danger-soft p-3 text-sm text-danger">{error}</div>}
        <button
          className="btn-primary mt-4 w-full"
          disabled={!!busy || amount === 0n || amount > (balance ?? 0n) || !validPrice}
          onClick={createListing}
        >
          {busy ?? "Approve & List"}
        </button>
        <p className="mt-2 flex gap-1.5 text-xs text-muted">
          <DocIcon className="h-3.5 w-3.5 shrink-0" /> Two wallet confirmations: approve credits, then deposit into escrow.
        </p>
      </div>
    </div>
  );
}
