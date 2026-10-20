"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useState } from "react";
import { parseEventLogs, parseUnits } from "viem";
import { useAccount, usePublicClient, useReadContracts, useSwitchChain, useWriteContract } from "wagmi";
import { marketplaceAbi, usdtAbi, useContracts, USDT_DECIMALS } from "@/lib/contracts";
import { errMessage, fmtTons, fmtUsd, splitRevenue } from "@/lib/format";
import { useAfterTx, type Listing } from "@/lib/hooks";
import { defaultChain } from "@/lib/wagmi";
import { CheckIcon, FlameIcon, ShieldIcon } from "./icons";
import { Modal } from "./ui";

type Phase = "form" | "approving" | "buying" | "done";

export function BuyOffsetModal({ listing, projectName, onClose }: { listing: Listing; projectName?: string; onClose: () => void }) {
  const c = useContracts();
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const client = usePublicClient({ chainId: c.chainId });
  const { writeContractAsync } = useWriteContract();
  const afterTx = useAfterTx();

  const [tonsInput, setTonsInput] = useState("100");
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<{ certificateId: bigint; tons: bigint; txHash: `0x${string}` }>();

  const tons = /^\d+$/.test(tonsInput) ? BigInt(tonsInput) : 0n;
  const cost = listing.pricePerTon * tons;
  const split = splitRevenue(cost);

  const { data: reads, refetch } = useReadContracts({
    contracts: [
      { address: c.ready ? c.usdt : undefined, abi: usdtAbi, functionName: "balanceOf", args: [address!], chainId: c.chainId },
      { address: c.ready ? c.usdt : undefined, abi: usdtAbi, functionName: "allowance", args: [address!, c.ready ? c.marketplace : address!], chainId: c.chainId },
    ],
    query: { enabled: c.ready && !!address },
  });
  const balance = reads?.[0].result ?? 0n;
  const allowance = reads?.[1].result ?? 0n;
  const needsApproval = allowance < cost;

  const tooMany = tons > listing.available;
  const insufficient = isConnected && cost > balance;
  const busy = phase === "approving" || phase === "buying";
  const name = projectName ?? `Project #${listing.projectId}`;

  async function faucet() {
    if (!c.ready || !client || !address) return;
    setError(undefined);
    try {
      const hash = await writeContractAsync({
        address: c.usdt,
        abi: usdtAbi,
        functionName: "mint",
        args: [address, parseUnits("10000", USDT_DECIMALS)],
      });
      await client.waitForTransactionReceipt({ hash });
      await refetch();
    } catch (e) {
      setError(errMessage(e));
    }
  }

  async function submit() {
    if (!c.ready || !client || !address) return;
    setError(undefined);
    try {
      if (needsApproval) {
        setPhase("approving");
        const hash = await writeContractAsync({
          address: c.usdt,
          abi: usdtAbi,
          functionName: "approve",
          args: [c.marketplace, cost],
        });
        await client.waitForTransactionReceipt({ hash });
        await refetch();
      }
      setPhase("buying");
      const hash = await writeContractAsync({
        address: c.marketplace,
        abi: marketplaceAbi,
        functionName: "buyAndOffset",
        args: [listing.listingId, tons, cost],
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");
      const [event] = parseEventLogs({ abi: marketplaceAbi, eventName: "CarbonOffset", logs: receipt.logs });
      setResult({ certificateId: event.args.certificateId, tons: event.args.tons, txHash: hash });
      setPhase("done");
      afterTx();
    } catch (e) {
      setError(errMessage(e));
      setPhase("form");
      refetch();
    }
  }

  if (phase === "done" && result) {
    return (
      <Modal open onClose={onClose} title="Offset complete">
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-soft text-brand">
            <ShieldIcon className="h-7 w-7" />
          </div>
          <div className="mt-4 text-2xl font-semibold">{fmtTons(result.tons)} tCO₂e retired</div>
          <p className="mt-1 text-sm text-muted">
            The credits were burned on-chain and Certificate #{result.certificateId.toString()} was minted to your wallet.
            It is soulbound and cannot be transferred.
          </p>
          <div className="mt-4 break-all rounded-md bg-canvas p-3 text-left font-mono text-xs text-muted">tx {result.txHash}</div>
          <div className="mt-5 flex gap-3">
            <button className="btn-secondary flex-1" onClick={onClose}>Close</button>
            <Link className="btn-primary flex-1" href="/portfolio">View certificate</Link>
          </div>
        </div>
      </Modal>
    );
  }

  const wrongChain = isConnected && !c.ready;

  return (
    <Modal open onClose={busy ? () => {} : onClose} title="Buy & Offset Carbon">
      <div className="text-sm text-muted">{name}</div>
      <div className="mt-1 text-sm">
        {fmtUsd(listing.pricePerTon)} <span className="text-muted">per tCO₂e · {fmtTons(listing.available)} available</span>
      </div>

      <label className="label mt-5" htmlFor="tons">Amount to offset (tCO₂e)</label>
      <input
        id="tons"
        className="input text-lg tabular-nums"
        inputMode="numeric"
        value={tonsInput}
        disabled={busy}
        onChange={(e) => setTonsInput(e.target.value.replace(/[^\d]/g, ""))}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {[10n, 100n, 1000n, 10000n].filter((n) => n <= listing.available).map((n) => (
          <button key={n} disabled={busy} onClick={() => setTonsInput(n.toString())} className="rounded border border-line px-2.5 py-1 text-xs hover:bg-canvas">
            {fmtTons(n)}
          </button>
        ))}
      </div>
      {tooMany && <p className="mt-2 text-sm text-danger">Only {fmtTons(listing.available)} tCO₂e available.</p>}

      <div className="mt-5 rounded-md border border-line">
        <div className="flex justify-between px-4 py-3 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{fmtUsd(cost)} USDT</span>
        </div>
        <dl className="space-y-1.5 border-t border-line px-4 py-3 text-sm">
          {[
            ["Forest owner (87%)", split.owner],
            ["Auditor (5%)", split.auditor],
            ["LaoCarbon platform (5%)", split.platform],
            ["Government of Lao PDR (3%)", split.government],
          ].map(([k, v]) => (
            <div key={k as string} className="flex justify-between text-muted">
              <dt>{k as string}</dt>
              <dd className="tabular-nums">{fmtUsd(v as bigint)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="mt-4 flex gap-2 text-sm text-muted">
        <FlameIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        Credits are burned immediately in the same transaction — they never enter your wallet and can't be resold or
        double-counted. You receive a non-transferable retirement certificate instead.
      </p>

      {isConnected && c.ready && (
        <ol className="mt-5 space-y-2 text-sm">
          <Step n={1} label="Approve USDT spending" sub="MetaMask confirmation 1 of 2" done={!needsApproval && cost > 0n} active={phase === "approving"} />
          <Step n={2} label="Pay, burn credits & mint certificate" sub="MetaMask confirmation 2 of 2 — one atomic transaction" active={phase === "buying"} />
        </ol>
      )}

      {insufficient && c.ready && (
        <div className="mt-4 rounded-md bg-warn-soft p-3 text-sm text-warn">
          Your USDT balance is {fmtUsd(balance)}.{" "}
          <button onClick={faucet} disabled={busy} className="font-medium underline">Get 10,000 test USDT</button>
        </div>
      )}
      {error && <div className="mt-4 rounded-md bg-danger-soft p-3 text-sm text-danger">{error}</div>}

      <div className="mt-5">
        {!isConnected ? (
          <button className="btn-primary w-full" onClick={openConnectModal}>Connect wallet to buy</button>
        ) : wrongChain ? (
          <button className="btn-primary w-full" onClick={() => switchChain({ chainId: defaultChain.id })}>
            Switch to {defaultChain.name}
          </button>
        ) : (
          <button className="btn-primary w-full py-3" disabled={busy || tons === 0n || tooMany || insufficient} onClick={submit}>
            {phase === "approving" ? "Approving USDT…" : phase === "buying" ? "Offsetting…" : needsApproval ? "Approve & Buy" : "Buy & Offset"}
          </button>
        )}
      </div>
    </Modal>
  );
}

function Step({ n, label, sub, done, active }: { n: number; label: string; sub: string; done?: boolean; active?: boolean }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
          done ? "bg-brand text-white" : active ? "bg-brand-soft text-brand ring-2 ring-brand" : "bg-canvas text-muted"
        }`}
      >
        {done ? <CheckIcon className="h-3.5 w-3.5" /> : n}
      </span>
      <span>
        <span className={active ? "font-medium" : ""}>{label}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </span>
    </li>
  );
}
