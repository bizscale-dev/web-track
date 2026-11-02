"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { BellRing } from "lucide-react";

type NotificationRow = {
  id: string;
  message: string;
  link_url: string;
};

type BugRow = {
  id: number;
  title: string;
  developer_seen: boolean;
};

function fire(router: ReturnType<typeof useRouter>, body: string, tag: string, linkUrl?: string) {
  if (typeof window === "undefined" || Notification.permission !== "granted") return;
  const popup = new Notification("Website CRM", { body, icon: "/favicon.ico", tag });
  popup.onclick = () => {
    window.focus();
    if (linkUrl) router.push(linkUrl);
    popup.close();
  };
}

// Fires a real OS/browser-level notification (the popup that floats above
// the taskbar, not just our in-app bell/banner) for task assignments
// (via user_notifications, which dispatchTaskNotification/etc. already
// write to) and production bug assignments/reassignments (production_bugs
// has no equivalent notification row, so it's subscribed directly).
export default function DesktopNotifier() {
  const { email } = useAuth();
  const router = useRouter();
  // Chrome silently ignores Notification.requestPermission() unless it's
  // called from a real user gesture (a click) — calling it from an effect
  // on mount never shows the prompt and leaves permission stuck on
  // "default" forever. So instead we show a small button the person has to
  // click, which counts as a gesture.
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (!email) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const channel = supabase
      .channel(`desktop_notify_${email}_${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_notifications", filter: `user_email=eq.${email}` },
        (payload) => {
          const row = payload.new as NotificationRow;
          fire(router, row.message, `note_${row.id}`, row.link_url);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "production_bugs", filter: `developer_email=eq.${email}` },
        (payload) => {
          const row = payload.new as BugRow;
          if (!row || row.developer_seen !== false) return;
          fire(router, `New bug assigned: "${row.title}"`, `bug_${row.id}_${Date.now()}`, `/production-bugs?bugId=${row.id}`);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [email, router]);

  if (permission !== "default") return null;

  return (
    <button
      type="button"
      onClick={() => {
        Notification.requestPermission().then(setPermission);
      }}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent)]/30 rounded-full text-xs font-bold hover:opacity-80 transition-opacity shrink-0"
      title="Get a desktop popup when a task or bug is assigned to you, even if this tab is in the background"
    >
      <BellRing className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">Enable Desktop Alerts</span>
    </button>
  );
}
