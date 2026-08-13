export type EodSiteStatus = 'live' | 'subdomain_wip' | 'manual';

export type EodSiteOption = {
  name: string;
  domain: string | null;
  status: EodSiteStatus;
};

export type EodSitePage = {
  label: string;
  url: string;
};

export type EodReportStatus = 'draft' | 'submitted';

export type EodReport = {
  id: number;
  team_member_email: string;
  team_member_name: string;
  report_date: string;
  status: EodReportStatus;
  submitted_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type EodEntry = {
  id: number;
  report_id: number;
  site_name: string;
  site_domain: string | null;
  site_status: EodSiteStatus;
  page_label: string;
  page_url: string | null;
  is_new_page: boolean;
  notes: string;
  created_at?: string | null;
};

export type EodReportWithEntries = EodReport & {
  eod_entries: EodEntry[];
};
