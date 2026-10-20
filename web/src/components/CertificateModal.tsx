"use client";

import { useMemo } from "react";
import { useReadContract } from "wagmi";
import { certificateAbi, useContracts } from "@/lib/contracts";
import { fmtDate, fmtTons, fmtUsd } from "@/lib/format";
import type { Offset } from "@/lib/hooks";
import { ShieldIcon } from "./icons";
import { Modal } from "./ui";

export function CertificateModal({ offset, projectName, onClose }: { offset: Offset; projectName: string; onClose: () => void }) {
  const c = useContracts();
  const { data: uri } = useReadContract({
    address: c.ready ? c.certificate : undefined,
    abi: certificateAbi,
    functionName: "tokenURI",
    args: [offset.certificateId],
    chainId: c.chainId,
  });
  const metadataOk = useMemo(() => {
    if (!uri?.startsWith("data:application/json;base64,")) return false;
    try {
      return !!JSON.parse(atob(uri.split(",")[1])).name;
    } catch {
      return false;
    }
  }, [uri]);

  return (
    <Modal open onClose={onClose} title={`Certificate #${offset.certificateId}`} wide>
      <div className="rounded-lg border-2 border-brand/30 bg-gradient-to-b from-brand-soft/60 to-white p-6 text-center sm:p-10">
        <ShieldIcon className="mx-auto h-10 w-10 text-brand" />
        <div className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand">Carbon Retirement Certificate</div>
        <div className="mt-4 text-sm text-muted">This certifies that</div>
        <div className="mt-1 break-all font-mono text-sm sm:text-base">{offset.buyer}</div>
        <div className="mt-4 text-sm text-muted">has permanently retired</div>
        <div className="mt-1 text-4xl font-bold tabular-nums text-brand">{fmtTons(offset.tons)} tCO₂e</div>
        <div className="mt-4 text-sm text-muted">from</div>
        <div className="mt-1 text-lg font-semibold">{projectName}</div>
        <div className="mt-6 grid gap-3 text-left text-sm sm:grid-cols-3">
          <Field k="Retired at" v={fmtDate(offset.timestamp)} />
          <Field k="Amount paid" v={`${fmtUsd(offset.totalPaid)} USDT`} />
          <Field k="Project document" v={`ipfs://${offset.ipfsHash.slice(0, 18)}…`} />
        </div>
      </div>
      <dl className="mt-4 space-y-1.5 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted">Transaction</dt><dd className="break-all font-mono text-xs">{offset.txHash}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted">Token standard</dt><dd className="text-right">ERC-721 · soulbound (ERC-5192, non-transferable)</dd></div>
        <div className="flex justify-between"><dt className="text-muted">On-chain metadata</dt><dd>{metadataOk ? "Verified ✓" : "Loading…"}</dd></div>
      </dl>
      <div className="mt-5 flex justify-end gap-3">
        <button className="btn-secondary" onClick={() => window.print()}>Print</button>
        <button className="btn-primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md bg-white/80 p-3">
      <div className="text-xs text-muted">{k}</div>
      <div className="mt-0.5 truncate font-medium" title={v}>{v}</div>
    </div>
  );
}
