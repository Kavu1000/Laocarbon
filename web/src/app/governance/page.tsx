import Link from "next/link";
import { GovernanceLog } from "@/components/GovernanceLog";

export const metadata = { title: "Governance Log · LaoCarbon" };

export default function GovernancePage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard" className="text-sm text-muted hover:text-ink">← Dashboard</Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Governance Log</h1>
      <p className="mt-1 text-muted">
        Every privileged action on LaoCarbon, newest first. Registry decisions (project reviews, verification records, KYC) are
        recorded by the database the moment they happen; administrator changes to accounts are recorded by the server. Nobody can
        edit or delete entries through the app. On-chain entries are tamper-proof and can be checked independently on a block
        explorer using their transaction hash.
      </p>
      <div className="card mt-5 p-4 text-sm">
        <p className="font-medium">What admins and auditors cannot do</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          <li>Move or revoke a buyer's retirement certificate — certificates are soulbound.</li>
          <li>Edit or delete past purchases and burns — they are permanent blockchain records.</li>
          <li>Change the 87 / 5 / 5 / 3 revenue split — it is fixed in the marketplace contract.</li>
          <li>Skip the log — reviews are captured by database triggers, not by the auditor&apos;s browser.</li>
        </ul>
      </div>
      <div className="mt-6">
        <GovernanceLog />
      </div>
    </div>
  );
}
