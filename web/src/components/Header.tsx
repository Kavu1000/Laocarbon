"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
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

const NAV = [
  { href: "/", label: "Marketplace" },
  { href: "/register", label: "Register Project" },
  { href: "/auditor", label: "Auditor" },
  { href: "/portfolio", label: "Portfolio" },
];

export function Header() {
  const path = usePathname();
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
          {NAV.map((n) => {
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
          <ConnectButton label="Connect Wallet" accountStatus="address" chainStatus="icon" showBalance={false} />
        </div>
      </div>
    </header>
  );
}
