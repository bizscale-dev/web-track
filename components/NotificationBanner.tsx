"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Bell, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

type AppNotification = {
  id: string;
  message: string;
  link_url: string;
  is_read: boolean;
  created_at: string;
};

// A full-width banner for the single most recent unread notification —
// the bell icon's dropdown is easy to miss entirely; this puts it directly
// in view instead of behind a click.
export default function NotificationBanner() {
  const { role, email } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Anyone signed in can be the target of a task/bug/edit notification, not
  // just admin/manager/developer — unlike the bell, this isn't role-limited.
  const canSee = role !== "user" && !!role;

  useEffect(() => {
    if (!canSee || !email) return;
    (async () => {
      const { data } = await supabase
        .from("user_notifications")
        .select("*")
        .eq("user_email", email)
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(5);
      setNotifications(data || []);
    })();
  }, [canSee, email]);

  if (!canSee) return null;

  const visible = notifications.filter((n) => !dismissedIds.has(n.id));
  const current = visible[0];
  if (!current) return null;

  const dismiss = async (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
    await supabase.from("user_notifications").update({ is_read: true }).eq("id", id);
  };

  const openCurrent = () => {
    dismiss(current.id);
    if (current.link_url) router.push(current.link_url);
  };

  return (
    <div className="relative w-full bg-[var(--accent-light)] border-b border-[var(--accent)]/20 px-10 py-2">
      <button
        type="button"
        onClick={openCurrent}
        className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-[var(--accent)] hover:opacity-80 transition-opacity truncate"
        title={current.message}
      >
        <Bell className="w-4 h-4 shrink-0" />
        <span className="truncate">{current.message}</span>
        {visible.length > 1 && (
          <span className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-full bg-[var(--accent)] text-[var(--accent-text)]">
            +{visible.length - 1} more
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => dismiss(current.id)}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--accent)] hover:opacity-70 transition-opacity"
        aria-label="Dismiss notification"
        title="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
