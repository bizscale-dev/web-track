export type SiteReview = {
  id: number;
  site_name: string;
  site_domain: string | null;
  review_period: string;
  checked_by_name: string;
  checked_by_email: string;
  checked_at: string;
};
