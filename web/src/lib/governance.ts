// Shapes shared by the governance/admin API routes and pages.

export type GovernanceEntry = {
  id: number;
  actor_id: string | null;
  actor_name: string;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: string;
  target_label: string;
  details: Record<string, unknown>;
  created_at: string;
};

export type RoleEvent = { contract: string; role: string; account: string; sender: string; granted: boolean; txHash: string; timestamp: number };
export type Registration = { project_id: number; forest_owner: string; auditor: string; block_number: number; tx_hash: string };
export type GovernanceResponse = { offchain: GovernanceEntry[]; registrations: Registration[]; roleEvents: RoleEvent[] };

export type AdminUser = {
  id: string;
  email: string;
  fullName: string;
  orgName: string;
  role: string;
  kycStatus: string;
  suspended: boolean;
  wallet: string | null;
  createdAt: string;
  lastSignIn: string | null;
};

export type AdminOverview = {
  users: { total: number; byRole: Record<string, number>; suspended: number; kycPending: number };
  projects: Record<string, number>;
  finance: { volume: number; platform: number; government: number; auditors: number; owners: number };
  roles: { contract: string; address: string; role: string; holders: string[] }[];
  wallets: { platform: string; government: string } | null;
};

const ACTION_LABEL: Record<string, string> = {
  "project.approved": "Approved project",
  "project.in_validation": "Started validation of",
  "project.changes_requested": "Requested changes to",
  "project.rejected": "Rejected project",
  "kyc.verified": "Verified organisation",
  "kyc.rejected": "Rejected KYC of",
  "user.role_changed": "Changed role of",
  "user.suspended": "Suspended",
  "user.reinstated": "Reinstated",
  "verification.document_review": "Recorded document review for",
  "verification.satellite_analysis": "Recorded satellite analysis for",
  "verification.field_visit": "Recorded field visit for",
};

export const describeAction = (a: string) => ACTION_LABEL[a] ?? a;

export const actionTone = (e: GovernanceEntry): "green" | "amber" | "red" | "gray" => {
  if (e.action.endsWith("approved") || e.action === "kyc.verified" || e.action === "user.reinstated") return "green";
  if (e.action.endsWith("rejected") || e.action === "user.suspended" || e.details?.result === "failed") return "red";
  if (e.action.endsWith("changes_requested") || e.details?.result === "flagged") return "amber";
  return "gray";
};
