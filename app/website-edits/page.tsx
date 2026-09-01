import WebsiteEditsClient from "@/components/WebsiteEditsClient";

// route-segment config, only valid on a Server Component — this is why the
// page is this thin wrapper instead of the "use client" component itself.
// Raises the allowed serverless-function duration above Vercel's platform
// default so a slow (not hung — that's separately timeboxed in
// websiteEditsActions.ts) fetch of this ~400KB+ doc isn't hard-killed
// mid-request, which no try/catch can intercept.
export const maxDuration = 30;

export default function WebsiteEditsPage() {
  return <WebsiteEditsClient />;
}
