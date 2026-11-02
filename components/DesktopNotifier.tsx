"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

type NotificationRow = {
  id: string;
  message: string;
  link_url: string;
};

// Fires a real OS/browser-level notification (the popup that floats above
// the taskbar, not just our in-app bell) the moment a new row lands in
// user_notifications for this person — task assignments, reassignments,
// completions, etc. all go through dispatchTaskNotification/etc. into that
// same table, so subscribing there covers all of them for free.
export default function DesktopNotifier() {
  const { email } = useAuth();
  const router = useRouter();
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!email) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;

    if (!requestedRef.current && Notification.permission === "default") {
      requestedRef.current = true;
      Notification.requestPermission();
    }

    const channel = supabase
      .channel(`user_notifications_desktop_${email}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_notifications",
          filter: `user_email=eq.${email}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow;
          if (Notification.permission !== "granted") return;

          const popup = new Notification("Website CRM", {
            body: row.message,
            icon: "/favicon.ico",
            tag: row.id,
          });

          popup.onclick = () => {
            window.focus();
            if (row.link_url) router.push(row.link_url);
            popup.close();
          };
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [email, router]);

  return null;
}
