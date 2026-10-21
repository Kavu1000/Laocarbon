// Shape of /api/dashboard. Money is in whole USDT (float, display only); tons are whole tCO2e.

export type Range = "7d" | "30d" | "365d" | "all";
export const RANGES: { id: Range; label: string }[] = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "365d", label: "12 months" },
  { id: "all", label: "All time" },
];

export type Kpi = { value: number; previous: number | null };
export type VerificationLevel = "passed" | "flagged" | "failed" | null;

export type DashboardData = {
  generatedAt: string;
  kpis: {
    retiredTons: Kpi;
    volumeUsd: Kpi;
    ownersUsd: Kpi;
    governmentUsd: Kpi;
    buyers: Kpi;
    verifiedProjects: number;
    protectedHa: number;
    availableTons: number;
  };
  bucket: "day" | "month";
  series: { t: string; tons: number; usd: number }[];
  split: { owners: number; auditors: number; platform: number; government: number };
  byType: { label: string; tons: number }[];
  byProvince: { label: string; tons: number }[];
  projects: {
    id: number;
    name: string;
    province: string;
    type: string;
    status: string;
    retired: number;
    available: number;
    soldPct: number;
    price: number | null;
    verification: { document: VerificationLevel; satellite: VerificationLevel; field: VerificationLevel };
    lastVerified: string | null;
  }[];
  leaderboard: { wallet: string; name: string | null; avatarUrl: string | null; verified: boolean; tons: number; certificates: number }[];
  recent: { certificateId: number; buyer: string; buyerName: string | null; projectId: number; projectName: string; tons: number; usd: number; time: string; txHash: string; direct: boolean }[];
  map: { id: number; name: string; status: string; flagged: boolean; retired: number; lat: number | null; lng: number | null; boundary: unknown }[];
  health: { listed: number; documentReviewed: number; satelliteVerified: number; fieldVisited: number; flagged: number; stale: number };
};
