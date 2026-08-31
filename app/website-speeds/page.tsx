"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { getWebsiteSpeeds } from "@/app/websiteSpeedActions";
import type { WebsiteSpeed } from "@/type/websiteSpeed";
import {
  Loader2,
  ShieldAlert,
  Gauge,
  Search,
  ArrowLeft,
  ExternalLink,
  Globe,
} from "lucide-react";

function scoreBand(score: number | null): { label: string; badge: string; text: string } {
  if (score === null) return { label: "N/A", badge: "bg-gray-100 text-gray-400", text: "text-gray-400" };
  if (score >= 90) return { label: "Good", badge: "bg-emerald-100 text-emerald-700", text: "text-emerald-600" };
  if (score >= 50) return { label: "Needs Work", badge: "bg-amber-100 text-amber-700", text: "text-amber-600" };
  return { label: "Poor", badge: "bg-rose-100 text-rose-700", text: "text-rose-600" };
}

function ScorePill({ label, score }: { label: string; score: number | null }) {
  const band = scoreBand(score);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-base font-black ${band.badge}`}>
        {score ?? "–"}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</span>
    </div>
  );
}

export default function WebsiteSpeedsPage() {
  const { role, loading: authLoading } = useAuth();
  const canView = role === "developer" || role === "manager" || role === "admin";

  const [speeds, setSpeeds] = useState<WebsiteSpeed[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (canView) loadSpeeds();
  }, [canView]);

  const loadSpeeds = async () => {
    setIsLoading(true);
    const data = await getWebsiteSpeeds();
    if (data.length === 0) {
      setError("Could not load speed data — check sheet connectivity.");
    }
    setSpeeds(data);
    setIsLoading(false);
  };

  const filtered = speeds.filter((s) =>
    s.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  // Worst-scoring sites first, so what needs attention surfaces at the top.
  const sorted = [...filtered].sort((a, b) => {
    const worstA = Math.min(a.desktopScore ?? 100, a.mobileScore ?? 100);
    const worstB = Math.min(b.desktopScore ?? 100, b.mobileScore ?? 100);
    if (worstA !== worstB) return worstA - worstB;
    return a.name.localeCompare(b.name);
  });

  const needsAttentionCount = speeds.filter(
    (s) => (s.desktopScore !== null && s.desktopScore < 50) || (s.mobileScore !== null && s.mobileScore < 50)
  ).length;

  if (authLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="p-10 max-w-2xl mx-auto text-center mt-20 bg-rose-50 border border-rose-100 rounded-2xl">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Clearance Required</h1>
        <p className="text-gray-600">Only Developers, Managers and Admins can access Website Speeds.</p>
      </div>
    );
  }

  return (
    <main className="p-4 sm:p-8 max-w-4xl mx-auto w-full">
      <Link
        href="/site-reviews"
        className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Site Reviews
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-sm">
          <Gauge className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Website Speeds</h1>
          <p className="text-gray-500 text-sm mt-1">PageSpeed Insights scores · Desktop &amp; Mobile</p>
        </div>
      </div>

      {!isLoading && speeds.length > 0 && needsAttentionCount > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl shadow-sm p-4 mb-6 mt-6 text-sm font-bold text-rose-700">
          {needsAttentionCount} site{needsAttentionCount === 1 ? "" : "s"} scoring below 50 need attention
        </div>
      )}

      <div className="relative mb-4 mt-6">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sites..."
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white shadow-sm"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">{error}</div>
      ) : (
        <div className="space-y-2.5">
          {sorted.map((site) => (
            <div
              key={site.name}
              className="flex items-center gap-4 p-4 rounded-2xl border border-gray-200 bg-white shadow-sm hover:border-blue-200 transition-all"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800">{site.name}</p>
                {site.url && (
                  <a
                    href={site.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1 mt-0.5 truncate w-fit"
                  >
                    <Globe className="w-3 h-3 shrink-0" /> {site.url}
                  </a>
                )}
                {site.lastChecked && (
                  <p className="text-[11px] text-gray-400 mt-0.5">Last checked {site.lastChecked}</p>
                )}
              </div>

              <ScorePill label="Desktop" score={site.desktopScore} />
              <ScorePill label="Mobile" score={site.mobileScore} />

              {site.reportUrl && (
                <a
                  href={site.reportUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="View full PageSpeed Insights report"
                  className="shrink-0 p-2 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          ))}
          {sorted.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-10">No sites match your search.</p>
          )}
        </div>
      )}
    </main>
  );
}
