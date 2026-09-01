import WebsiteSpeedsClient from "@/components/WebsiteSpeedsClient";

// route-segment config, only valid on a Server Component — this is why the
// page is this thin wrapper instead of the "use client" component itself.
// Raises the allowed serverless-function duration above Vercel's platform
// default for the Google Sheets calls this page's actions make.
export const maxDuration = 20;

export default function WebsiteSpeedsPage() {
  return <WebsiteSpeedsClient />;
}
