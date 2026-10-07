// Hourly Vercel Cron job (see vercel.json) — the only way to catch edits
// made directly in the Google Doc (not through our app's "Add entry"
// button, which already notifies people itself via dispatchWebsiteEditNotification).
// Google doesn't push us anything when the doc changes, so this polls it,
// diffs each tab's content against what we saw last time, and notifies the
// team about whichever tabs changed. No per-editor attribution is possible
// here — our Docs API access isn't per-user — so the message stays generic.

import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { getWebsiteEditsTabs } from "@/app/websiteEditsActions";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ success: false, error: "Missing Supabase credentials" }, { status: 500 });
  }
  const adminDb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const tabs = await getWebsiteEditsTabs();
    if (tabs.length === 0) {
      return Response.json({ success: false, error: "Could not load the doc" }, { status: 502 });
    }

    const { data: previousStateRows } = await adminDb
      .from("website_edits_doc_state")
      .select("tab_id, content_hash");
    const previousHashByTabId = new Map((previousStateRows || []).map((r) => [r.tab_id, r.content_hash]));

    const changedTabs: { id: string; title: string }[] = [];
    const upserts: { tab_id: string; tab_title: string; content_hash: string; updated_at: string }[] = [];

    for (const tab of tabs) {
      const hash = createHash("sha256").update(JSON.stringify(tab.blocks)).digest("hex");
      const previousHash = previousHashByTabId.get(tab.id);

      // Only flag a change when we already had a baseline for this tab —
      // the very first time we see a tab, record it quietly so rollout
      // doesn't fire a notification for every single existing site.
      if (previousHash !== undefined && previousHash !== hash) {
        changedTabs.push({ id: tab.id, title: tab.title });
      }
      if (previousHash !== hash) {
        upserts.push({ tab_id: tab.id, tab_title: tab.title, content_hash: hash, updated_at: new Date().toISOString() });
      }
    }

    if (upserts.length > 0) {
      await adminDb.from("website_edits_doc_state").upsert(upserts, { onConflict: "tab_id" });
    }

    if (changedTabs.length > 0) {
      const { data: team } = await adminDb.from("team_members").select("email, role");
      const targetEmails = (team || [])
        .filter((t) => ["admin", "manager", "developer"].includes((t.role || "").toLowerCase()))
        .map((t) => t.email);

      const notifications = changedTabs.flatMap((tab) =>
        targetEmails.map((userEmail) => ({
          user_email: userEmail,
          message: `The edit doc for "${tab.title}" was updated`,
          link_url: `/website-edits?tab=${encodeURIComponent(tab.id)}`,
          is_read: false,
          source: "website_edit",
        }))
      );

      if (notifications.length > 0) {
        await adminDb.from("user_notifications").insert(notifications);
      }
    }

    return Response.json({ success: true, changed: changedTabs.length, checked: tabs.length });
  } catch (error) {
    console.error("Website edits doc poll failed:", error);
    return Response.json({ success: false, error: String(error) }, { status: 500 });
  }
}
