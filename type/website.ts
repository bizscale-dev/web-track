export type Website = {
  id: number;
  website_name: string;
  domain: string | null;
  status: string | null;
  priority: string | null;
  developer: string | null;
  content_writer: string | null;
  seo_person: string | null;
  credentials: string | null;
  notes: string | null;
  created_at?: string | null;
  // Synthetic field: populated server-side from website_tasks count
  pages?: string[];
  website_tasks?: { count: number }[] | Record<string, unknown>[];
};

export type WebsiteCredential = {
  id: number;
  website_id: number;
  login_url: string | null;
  username: string | null;
  password: string | null;
  created_at?: string | null;
};

export type WebsitePage = {
  id: number;
  website_id: number;
  title: string;
  page_url: string | null;
  status: string;
  notes: string | null;
  sort_order: number;
  created_at?: string | null;
};

export type WebsiteActivityLog = {
  id: number;
  website_id: number;
  event_type: string;
  message: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at?: string | null;
};
