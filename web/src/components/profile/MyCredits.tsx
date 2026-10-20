"use client";

import { useState } from "react";
import { parseEventLogs, parseUnits, type Address } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { BuildingIcon, FlameIcon, LeafIcon, ShieldIcon } from "@/components/icons";
import { Badge, StatCard } from "@/components/ui";
import { carbonTokenAbi, marketplaceAbi, useContracts, USDT_DECIMALS } from "@/lib/contracts";
import { errMessage, fmtTons, fmtUsd, shortAddr } from "@/lib/format";
import { useAfterTx, useListings, useRegisteredProjects } from "@/lib/hooks";
import { usePublicProjects } from "@/lib/projects";

/** Credits held by `wallet`: balance, escrowed listings, listing for sale and burning (retire). */
export function MyCredits({ wallet }: { wallet: Address }) {
  const c = useContracts();
  const { address: connected } = useAccount();
  const { data: projects = [] } = usePublicProjects();
  const { data: registered } = useRegisteredProjects();
  const { listings } = useListings();
  const client = usePublicClient({ chainId: c.chainId });
  const { writeContractAsync } = useWriteContract();
  const afterTx = useAfterTx();

  const { data: balance = 0n, refetch: refetchBalance } = useReadContract({
    address: c.ready ? c.carbonToken : undefined,
    abi: carbonTokenAbi,
    functionName: "balanceOf",
    args: [wallet],
    chainId: c.chainId,
  });

  const lower = wallet.toLowerCase();
  const owned = [...(registered?.entries() ?? [])].filter(([, r]) => r.forestOwner.toLowerCase() === lower).map(([id]) => id);
  const myListings = listings.filter((l) => l.seller.toLowerCase() === lower);
  const escrowed = myListings.reduce((s, l) => s + l.available, 0n);
  const nameOf = (id: bigint | number) => projects.find((p) => p.id === Number(id))?.name ?? `Project #${id}`;
  const canAct = !!connected && connected.toLowerCase() === lower;

  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  /** Sends a transaction and waits for it; returns the receipt or undefined on failure. */
  async function tx(label: string, fn: () => Promise<`0x${string}`>) {
    if (!client) return;
    setBusy(label);
    setError(undefined);
    try {
      const receipt = await client.waitForTransactionReceipt({ hash: await fn() });
      if (receipt.status !== "success") throw new Error("Transaction reverted");
      return receipt;
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(undefined);
    }
  }
  const done = () => {
    refetchBalance();
    afterTx();
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="In your wallet" value={fmtTons(balance)} unit="tCO₂e you can list or burn" icon={<LeafIcon className="h-5 w-5" />} />
        <StatCard label="Listed for sale" value={fmtTons(escrowed)} unit="tCO₂e held in marketplace escrow" icon={<BuildingIcon className="h-5 w-5" />} />
        <StatCard label="Projects you own" value={owned.length} unit="registered on-chain" icon={<ShieldIcon className="h-5 w-5" />} />
      </div>

      {!canAct && (
        <p className="rounded-md bg-warn-soft p-3 text-sm text-warn">
          {connected
            ? `Your connected wallet (${shortAddr(connected)}) isn't the one linked to this account (${shortAddr(wallet)}). Switch wallets in MetaMask to list or burn.`
            : "Connect your linked wallet to list or burn credits."}
        </p>
      )}
      {error && <div role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">{error}</div>}

      {owned.length === 0 && balance === 0n ? (
        <div className="card p-6 text-sm text-muted">
          You don't hold any carbon credits. Credits are issued to forest owners when a registry auditor approves their project;
          credits you buy on the Marketplace are burned immediately and appear as certificates in the Overview tab.
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <BurnForm
            owned={owned}
            balance={balance}
            nameOf={nameOf}
            disabled={!canAct || !!busy}
            busy={busy}
            onBurn={async (projectId, tons) => {
              if (!c.ready) return;
              const approved = await tx("Approving burn (1/2)…", () =>
                writeContractAsync({ address: c.carbonToken, abi: carbonTokenAbi, functionName: "approve", args: [c.marketplace, tons] }),
              );
              if (!approved) return;
              const r = await tx("Burning & minting certificate (2/2)…", () =>
                writeContractAsync({ address: c.marketplace, abi: marketplaceAbi, functionName: "retire", args: [BigInt(projectId), tons] }),
              );
              if (!r) return;
              done();
              const [ev] = parseEventLogs({ abi: marketplaceAbi, eventName: "CarbonOffset", logs: r.logs });
              return ev?.args.certificateId;
            }}
          />
          <ListForm
            owned={owned}
            balance={balance}
            nameOf={nameOf}
            disabled={!canAct || !!busy}
            busy={busy}
            onList={async (projectId, price, tons) => {
              if (!c.ready) return false;
              const ok =
                (await tx("Approving credits (1/2)…", () =>
                  writeContractAsync({ address: c.carbonToken, abi: carbonTokenAbi, functionName: "approve", args: [c.marketplace, tons] }),
                )) &&
                (await tx("Creating listing (2/2)…", () =>
                  writeContractAsync({
                    address: c.marketplace,
                    abi: marketplaceAbi,
                    functionName: "createListing",
                    args: [BigInt(projectId), parseUnits(price, USDT_DECIMALS), tons],
                  }),
                ));
              if (ok) done();
              return !!ok;
            }}
          />
        </div>
      )}

      {myListings.length > 0 && (
        <section className="card overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h3 className="font-semibold">My Listings</h3>
            <p className="text-sm text-muted">Credits in marketplace escrow. Each sale burns them automatically; withdraw returns unsold credits to your wallet.</p>
          </div>
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
                    <td className="px-4 py-3 text-right tabular-nums">{l.available > 0n ? `${fmtTons(l.available)} tCO₂e` : <Badge>Closed</Badge>}</td>
                    <td className="px-4 py-3 text-right">
                      {l.available > 0n && (
                        <button
                          className="btn-secondary px-3 py-1.5"
                          disabled={!canAct || !!busy}
                          onClick={async () => {
                            if (!c.ready) return;
                            const r = await tx("Withdrawing…", () =>
                              writeContractAsync({ address: c.marketplace, abi: marketplaceAbi, functionName: "cancelListing", args: [l.listingId] }),
                            );
                            if (r) done();
                          }}
                        >
                          Withdraw
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

type FormProps = { owned: number[]; balance: bigint; nameOf: (id: number) => string; disabled: boolean; busy?: string };

function AmountInput({ id, value, onChange, balance }: { id: string; value: string; onChange: (v: string) => void; balance: bigint }) {
  return (
    <div>
      <div className="flex items-end justify-between">
        <label className="label" htmlFor={id}>Amount (tCO₂e)</label>
        <button type="button" className="mb-1 text-xs font-medium text-brand" onClick={() => onChange(balance.toString())}>Max {fmtTons(balance)}</button>
      </div>
      <input id={id} className="input" inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))} />
    </div>
  );
}

function ProjectSelect({ id, owned, value, onChange, nameOf }: { id: string; owned: number[]; value: string; onChange: (v: string) => void; nameOf: (id: number) => string }) {
  return (
    <div>
      <label className="label" htmlFor={id}>Project</label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={!owned.length}>
        {owned.length ? owned.map((pid) => <option key={pid} value={pid}>{nameOf(pid)}</option>) : <option>No registered project</option>}
      </select>
    </div>
  );
}

function BurnForm({ owned, balance, nameOf, disabled, busy, onBurn }: FormProps & { onBurn: (projectId: number, tons: bigint) => Promise<bigint | undefined> }) {
  const [projectId, setProjectId] = useState("");
  const [tons, setTons] = useState("");
  const [result, setResult] = useState<{ id: bigint; tons: bigint }>();
  const amount = /^\d+$/.test(tons) ? BigInt(tons) : 0n;
  const pid = Number(projectId || owned[0]);
  const burning = busy?.startsWith("Approving burn") || busy?.startsWith("Burning");

  return (
    <section className="card border-danger/20 p-5">
      <h3 className="flex items-center gap-2 font-semibold"><FlameIcon className="h-5 w-5 text-danger" /> Burn Carbon Credits</h3>
      <p className="mt-1 text-sm text-muted">
        Permanently retire credits from your wallet to offset your own emissions. They're destroyed on-chain and you receive a
        soulbound certificate. This cannot be undone.
      </p>
      <div className="mt-4 space-y-3">
        <ProjectSelect id="burn-project" owned={owned} value={projectId} onChange={setProjectId} nameOf={nameOf} />
        <AmountInput id="burn-amount" value={tons} onChange={(v) => { setTons(v); setResult(undefined); }} balance={balance} />
      </div>
      {amount > balance && <p className="mt-2 text-sm text-danger">Exceeds your wallet balance.</p>}
      {result && (
        <p className="mt-3 rounded-md bg-brand-soft p-3 text-sm text-brand">
          Burned {fmtTons(result.tons)} tCO₂e — Certificate #{result.id.toString()} is in your Overview tab.
        </p>
      )}
      <button
        className="mt-4 w-full rounded-md bg-danger px-4 py-2.5 text-sm font-medium text-white hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled || !owned.length || amount === 0n || amount > balance}
        onClick={async () => {
          if (!window.confirm(`Burn ${fmtTons(amount)} tCO₂e permanently? This cannot be undone.`)) return;
          const id = await onBurn(pid, amount);
          if (id !== undefined) {
            setResult({ id, tons: amount });
            setTons("");
          }
        }}
      >
        {burning ? busy : "Burn & Get Certificate"}
      </button>
      <p className="mt-2 text-xs text-muted">Two wallet confirmations: approve, then burn.</p>
    </section>
  );
}

function ListForm({ owned, balance, nameOf, disabled, busy, onList }: FormProps & { onList: (projectId: number, price: string, tons: bigint) => Promise<boolean> }) {
  const [projectId, setProjectId] = useState("");
  const [price, setPrice] = useState("8.00");
  const [tons, setTons] = useState("");
  const amount = /^\d+$/.test(tons) ? BigInt(tons) : 0n;
  const validPrice = /^\d+(\.\d{1,6})?$/.test(price) && Number(price) > 0;
  const listing = busy?.startsWith("Approving credits") || busy?.startsWith("Creating listing");

  return (
    <section className="card p-5">
      <h3 className="flex items-center gap-2 font-semibold"><BuildingIcon className="h-5 w-5" /> List Credits for Sale</h3>
      <p className="mt-1 text-sm text-muted">Move credits into marketplace escrow. You receive 87% of every sale in USDT.</p>
      <div className="mt-4 space-y-3">
        <ProjectSelect id="list-project" owned={owned} value={projectId} onChange={setProjectId} nameOf={nameOf} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="list-price">Price (USDT / tCO₂e)</label>
            <input id="list-price" className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <AmountInput id="list-amount" value={tons} onChange={setTons} balance={balance} />
        </div>
      </div>
      {amount > balance && <p className="mt-2 text-sm text-danger">Exceeds your wallet balance.</p>}
      <button
        className="btn-primary mt-4 w-full py-2.5"
        disabled={disabled || !owned.length || amount === 0n || amount > balance || !validPrice}
        onClick={async () => {
          if (await onList(Number(projectId || owned[0]), price, amount)) setTons("");
        }}
      >
        {listing ? busy : "Approve & List"}
      </button>
      <p className="mt-2 text-xs text-muted">Two wallet confirmations: approve, then deposit into escrow.</p>
    </section>
  );
}
