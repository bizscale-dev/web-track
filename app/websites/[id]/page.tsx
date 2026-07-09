import { supabase } from "@/lib/supabase";
import { notFound } from "next/navigation";
import ClientPage from "./ClientPage";

export const dynamic = "force-dynamic";

export default async function WebsiteDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: website, error } = await supabase
    .from("websites")
    .select("*, website_tasks(*)")
    .eq("id", id)
    .single();

  if (error || !website) {
    notFound();
  }

  if (website.status) {
    website.status = website.status.trim();
  }

  return <ClientPage initialWebsite={website} />;
}
