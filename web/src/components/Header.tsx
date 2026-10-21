"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatUnits } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { useAuth } from "@/lib/auth";
import { usdtAbi, useContracts, USDT_DECIMALS } from "@/lib/contracts";
import { Avatar } from "./Avatar";
import { LeafIcon } from "./icons";

function AccountLinks() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user) {
    return (
      <Link href="/profile" className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-canvas" title="Profile">
        <Avatar user={user} size={32} />
        <span className="hidden max-w-[140px] truncate text-sm font-medium sm:block">{user.orgName}</span>
      </Link>
    );
  }
  return (
    <>
      <Link href="/login" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-canvas">Log in</Link>
      <Link href="/signup" className="btn-secondary hidden sm:inline-flex">Register</Link>
    </>
  );
}

const usdFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** The buyer's spending money; ETH (gas) is shown by RainbowKit's ConnectButton next to it. */
function UsdtBalance() {
  const c = useContracts();
  const { address, isConnected } = useAccount();
  const { data } = useReadContract({
    address: c.ready ? c.usdt : undefined,
    abi: usdtAbi,
    functionName: "balanceOf",
    args: [address!],
    chainId: c.chainId,
    query: { enabled: c.ready && !!address, refetchInterval: 15_000 },
  });
  if (!isConnected || !c.ready || data === undefined) return null;
  return (
    <span
      className="hidden items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-bold shadow-[0_4px_12px_rgba(0,0,0,0.1)] sm:inline-flex"
      title="USDT balance — used to buy carbon credits"
    >
      <span className="grid h-5 w-5 place-items-center rounded-full bg-[#26a17b] text-[11px] font-bold text-white">₮</span>
      <span className="tabular-nums">{usdFmt.format(Number(formatUnits(data, USDT_DECIMALS)))}</span>
      <span className="font-medium text-muted">USDT</span>
    </span>
  );
}

const NAV: { href: string; label: string; roles?: string[] }[] = [
  { href: "/", label: "Marketplace" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/register", label: "Register Project" },
  { href: "/profile", label: "Profile" },
  { href: "/auditor", label: "Auditor", roles: ["auditor", "admin"] },
  { href: "/admin", label: "Admin", roles: ["admin"] },
];

export function Header() {
  const path = usePathname();
  const { user } = useAuth();
  const nav = NAV.filter((n) => !n.roles || (user && n.roles.includes(user.role)));
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <LeafIcon className="h-8 w-8 text-brand" />
          <span className="leading-tight">
            <span className="block text-xl font-bold tracking-tight">LaoCarbon</span>
            <span className="block text-[11px] text-muted">Forests Today. A Cleaner Tomorrow.</span>
          </span>
        </Link>
        <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto">
          {nav.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium ${
                  active ? "bg-brand-soft text-brand" : "text-ink hover:bg-canvas"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <AccountLinks />
          <UsdtBalance />
          <ConnectButton
            label="Connect Wallet"
            accountStatus="address"
            chainStatus="icon"
            showBalance={{ smallScreen: false, largeScreen: true }}
          />
        </div>
      </div>
    </header>
  );
}
