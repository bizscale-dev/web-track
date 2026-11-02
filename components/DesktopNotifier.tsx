"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { savePushSubscription } from "@/app/actions";
import { BellRing } from "lucide-react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Registers a real Web Push subscription — this is what lets a task/bug
// assignment notification reach someone even if their tab was backgrounded
// and Chrome discarded it (killing any in-page realtime subscription), or
// the browser itself isn't focused. The in-app bell/banner/badges still
// use the lighter Supabase Realtime path for while the tab is actually
// alive; this component only handles the OS-level popup.
async function ensurePushSubscription(email: string) {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return;

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
  }

  const json = subscription.toJSON();
  if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
    await savePushSubscription(email, {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
  }
}

export default function DesktopNotifier() {
  const { email } = useAuth();
  // Chrome silently ignores Notification.requestPermission() unless it's
  // called from a real user gesture (a click) — calling it from an effect
  // on mount never shows the prompt and leaves permission stuck on
  // "default" forever. So a small button handles that gesture.
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPermission(Notification.permission);
  }, []);

  // Permission already granted from a previous visit (or before push
  // subscriptions existed) — make sure a subscription is actually on file
  // without needing the person to click anything again.
  useEffect(() => {
    if (!email || permission !== "granted") return;
    ensurePushSubscription(email).catch(() => {});
  }, [email, permission]);

  if (permission !== "default") return null;

  return (
    <button
      type="button"
      onClick={async () => {
        const result = await Notification.requestPermission();
        setPermission(result);
        if (result === "granted" && email) {
          ensurePushSubscription(email).catch(() => {});
        }
      }}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent)]/30 rounded-full text-xs font-bold hover:opacity-80 transition-opacity shrink-0"
      title="Get a desktop popup when a task or bug is assigned to you, even if this tab is in the background"
    >
      <BellRing className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">Enable Desktop Alerts</span>
    </button>
  );
}
