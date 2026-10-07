export type ProductionBugStatus = "open" | "fixed";
export type ProductionBugCause = "human_error" | "technical_issue";

export type ProductionBug = {
  id: number;
  title: string;
  description: string | null;
  site_name: string | null;
  site_domain: string | null;
  developer_name: string;
  developer_email: string;
  reported_by_name: string;
  reported_by_email: string;
  status: ProductionBugStatus;
  fixed_at: string | null;
  developer_seen: boolean;
  cause_type: ProductionBugCause;
  // Only set when cause_type is "human_error" — the person whose work left
  // the bug behind, distinct from developer_* (who's fixing it).
  caused_by_name: string | null;
  caused_by_email: string | null;
  screenshot_url: string | null;
  created_at: string;
};
