import EodClient from "@/components/EodClient";

// route-segment config, only valid on a Server Component — this is why the
// page is this thin wrapper instead of the "use client" component itself.
// Raises the allowed serverless-function duration above Vercel's platform
// default for the Google Sheets call this page's site list depends on.
export const maxDuration = 20;

export default function EodPage() {
  return <EodClient />;
}
