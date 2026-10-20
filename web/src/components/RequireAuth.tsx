"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ROLE_LABEL, useAuth, type Role } from "@/lib/auth";
import { ShieldIcon } from "./icons";

export function RequireAuth({ roles, children, reason }: { roles?: Role[]; children: ReactNode; reason: string }) {
  const { user, isLoading } = useAuth();
  const path = usePathname();
  if (isLoading) return <div className="py-16 text-center text-muted">Loading…</div>;

  if (!user) {
    const next = encodeURIComponent(path);
    return (
      <Gate title="Log in to continue" text={reason}>
        <Link className="btn-primary" href={`/login?next=${next}`}>Log in</Link>
        <Link className="btn-secondary" href={`/signup?next=${next}`}>Create an account</Link>
      </Gate>
    );
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <Gate
        title="Not available for your account"
        text={`This area is for ${roles.map((r) => ROLE_LABEL[r]).join(" / ")} accounts. You're signed in as ${ROLE_LABEL[user.role]}.`}
      >
        <Link className="btn-secondary" href="/">Back to Marketplace</Link>
      </Gate>
    );
  }
  return <>{children}</>;
}

function Gate({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <div className="card mx-auto mt-10 max-w-md p-8 text-center">
      <ShieldIcon className="mx-auto h-10 w-10 text-brand" />
      <h1 className="mt-3 text-xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-muted">{text}</p>
      <div className="mt-6 flex justify-center gap-3">{children}</div>
    </div>
  );
}
