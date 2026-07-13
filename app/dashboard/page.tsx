import { supabase } from "@/lib/supabase";
import DashboardClient from "@/components/DashboardClient";
import type { Website } from "@/type/website";

export const dynamic = "force-dynamic";
const FETCH_TIMEOUT_MS = 8000;

async function getWebsites(): Promise<{ websites: Website[]; error: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const { data, error } = await supabase
      .from("websites")
      .select("*, website_tasks(count)")
      .order("id", { ascending: false })
      .abortSignal(controller.signal);

    if (error) {
      return { websites: [], error: error.message };
    }

    const mappedWebsites: Website[] = (data ?? []).map((site) => ({
      ...site,
      status: site.status ? site.status.trim() : site.status,
      pages: Array(site.website_tasks?.[0]?.count || 0).fill("page"),
    }));

    return { websites: mappedWebsites, error: null };
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Supabase took too long to respond. Check your connection and project settings."
      : error instanceof Error ? error.message : "Unable to load websites.";
    return { websites: [], error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export default async function Home() {
  const { websites, error } = await getWebsites();
  return <DashboardClient initialData={websites} loadError={error} />;
}