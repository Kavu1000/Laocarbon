import { BaseError, formatUnits } from "viem";
import { USDT_DECIMALS } from "./contracts";

const num = new Intl.NumberFormat("en-US");
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export const fmtTons = (t: bigint | number) => num.format(t);
export const fmtUsd = (raw: bigint) => usd.format(Number(formatUnits(raw, USDT_DECIMALS)));
export const fmtDate = (unixSeconds: bigint | number) =>
  new Date(Number(unixSeconds) * 1000).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export const shortAddr = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export function errMessage(e: unknown) {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof BaseError && x.name === "UserRejectedRequestError")) {
      return "You rejected the request in your wallet.";
    }
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : String(e);
}

// Mirrors LaoCarbonMarketplace.buyAndOffset so the UI shows exactly what the contract will pay out.
export function splitRevenue(total: bigint) {
  const platform = (total * 500n) / 10_000n;
  const auditor = (total * 500n) / 10_000n;
  const government = (total * 300n) / 10_000n;
  return { owner: total - platform - auditor - government, platform, auditor, government };
}
