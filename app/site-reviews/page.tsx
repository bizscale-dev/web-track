"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { getReviewSiteOptions } from "@/app/siteReviewsActions";
import type { EodSiteOption } from "@/type/eod";
import type { ManualReviewSite, SiteReview } from "@/type/siteReview";
import {
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Search,
  ArrowLeft,
  CheckCircle2,
  Globe,
  PlusCircle,
} from "lucide-react";

function normalizeSiteLink(link: string): string {
  const trimmed = link.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function getPeriodKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const half = date.getDate() <= 15 ? "1" : "2";
  return `${year}-${month}-${half}`;
}

function getPeriodLabel(date: Date): string {
  const month = date.toLocaleString("en-US", { month: "long" });
  const year = date.getFullYear();
  const half = date.getDate() <= 15 ? "1st – 15th" : "16th – end";
  return `${month} ${half}, ${year}`;
}

function daysAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export default function SiteReviewsPage() {
  const { role, name, email, loading: authLoading } = useAuth();
  const canView = role === "developer" || role === "manager" || role === "admin";

  const [sites, setSites] = useState<EodSiteOption[]>([]);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [isLoadingSites, setIsLoadingSites] = useState(true);

  const [latestBySite, setLatestBySite] = useState<Record<string, SiteReview>>({});
  const [currentPeriodSites, setCurrentPeriodSites] = useState<Set<string>>(new Set());
  const [isLoadingReviews, setIsLoadingReviews] = useState(true);

  const [search, setSearch] = useState("");
  const [togglingSite, setTogglingSite] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const [isAddingManualSite, setIsAddingManualSite] = useState(false);
  const [manualSiteName, setManualSiteName] = useState("");
  const [manualSiteLink, setManualSiteLink] = useState("");
  const [isSavingManualSite, setIsSavingManualSite] = useState(false);
  const [manualSiteError, setManualSiteError] = useState<string | null>(null);

  const periodKey = useMemo(() => getPeriodKey(new Date()), []);
  const periodLabel = useMemo(() => getPeriodLabel(new Date()), []);

  useEffect(() => {
    if (canView) {
      loadSites();
      loadReviews();
    }
  }, [canView]);

  const loadSites = async () => {
    setIsLoadingSites(true);
    setSitesError(null);

    const [sheetOptions, manualResult] = await Promise.all([
      getReviewSiteOptions(),
      supabase.from("manual_review_sites").select("*").order("site_name", { ascending: true }),
    ]);

    if (sheetOptions.length === 0) {
      setSitesError("Could not load site list — check sheet connectivity.");
    }

    const seen = new Set(sheetOptions.map((s) => s.name.toLowerCase()));
    const manualOptions: EodSiteOption[] = ((manualResult.data as ManualReviewSite[]) || [])
      .filter((m) => !seen.has(m.site_name.toLowerCase()))
      .map((m) => ({ name: m.site_name, domain: m.site_domain, status: "manual" as const }));

    setSites(
      [...sheetOptions, ...manualOptions].sort((a, b) => a.name.localeCompare(b.name))
    );
    setIsLoadingSites(false);
  };

  const addManualSite = async () => {
    const trimmedName = manualSiteName.trim();
    if (!trimmedName) return;

    setIsSavingManualSite(true);
    setManualSiteError(null);

    const { error } = await supabase.from("manual_review_sites").insert({
      site_name: trimmedName,
      site_domain: manualSiteLink.trim() ? normalizeSiteLink(manualSiteLink) : null,
      added_by_name: name || "Unknown Operator",
      added_by_email: email || "",
    });

    setIsSavingManualSite(false);

    if (error) {
      setManualSiteError(`Couldn't add "${trimmedName}": ${error.message}`);
      return;
    }

    setManualSiteName("");
    setManualSiteLink("");
    setIsAddingManualSite(false);
    await loadSites();
  };

  const loadReviews = async () => {
    setIsLoadingReviews(true);
    const { data } = await supabase
      .from("site_reviews")
      .select("*")
      .order("checked_at", { ascending: false });

    const latest: Record<string, SiteReview> = {};
    const currentPeriod = new Set<string>();
    const period = getPeriodKey(new Date());

    ((data as SiteReview[]) || []).forEach((row) => {
      const key = row.site_name.toLowerCase();
      if (!latest[key]) latest[key] = row; // rows arrive newest-first, so the first hit per site is the latest
      if (row.review_period === period) currentPeriod.add(key);
    });

    setLatestBySite(latest);
    setCurrentPeriodSites(currentPeriod);
    setIsLoadingReviews(false);
  };

  const toggleReview = async (site: EodSiteOption) => {
    const key = site.name.toLowerCase();
    const isChecked = currentPeriodSites.has(key);
    setTogglingSite(key);
    setToggleError(null);

    const { error } = isChecked
      ? await supabase
          .from("site_reviews")
          .delete()
          .eq("site_name", site.name)
          .eq("review_period", periodKey)
      : await supabase.from("site_reviews").upsert(
          {
            site_name: site.name,
            site_domain: site.domain,
            review_period: periodKey,
            checked_by_name: name || "Unknown Operator",
            checked_by_email: email || "",
            checked_at: new Date().toISOString(),
          },
          { onConflict: "site_name,review_period" }
        );

    if (error) {
      setToggleError(`Couldn't save review for "${site.name}": ${error.message}`);
      setTogglingSite(null);
      return;
    }

    await loadReviews();
    setTogglingSite(null);
  };

  const filteredSites = sites.filter((s) =>
    s.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const sortedSites = [...filteredSites].sort((a, b) => {
    const aChecked = currentPeriodSites.has(a.name.toLowerCase());
    const bChecked = currentPeriodSites.has(b.name.toLowerCase());
    if (aChecked !== bChecked) return aChecked ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  const reviewedCount = sites.filter((s) => currentPeriodSites.has(s.name.toLowerCase())).length;
  const totalCount = sites.length;
  const progressPct = totalCount > 0 ? Math.round((reviewedCount / totalCount) * 100) : 0;

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
        <p className="text-gray-600">Only Developers, Managers and Admins can access Site Reviews.</p>
      </div>
    );
  }

  const isLoading = isLoadingSites || isLoadingReviews;

  return (
    <main className="p-4 sm:p-8 max-w-4xl mx-auto w-full">
      <Link
        href="/dashboard"
        className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-sm">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Site Reviews</h1>
          <p className="text-gray-500 text-sm mt-1">Bi-monthly health check · {periodLabel}</p>
        </div>
      </div>

      {toggleError && (
        <div className="p-4 mt-6 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">
          {toggleError}
        </div>
      )}

      {!isLoading && totalCount > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 mb-6 mt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-gray-700">
              {reviewedCount} of {totalCount} sites reviewed this period
            </span>
            <span className="text-sm font-bold text-indigo-600">{progressPct}%</span>
          </div>
          <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      <div className="relative mb-4 mt-6">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search live sites..."
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white shadow-sm"
        />
      </div>

      {manualSiteError && (
        <div className="p-4 mb-4 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">
          {manualSiteError}
        </div>
      )}

      {isAddingManualSite ? (
        <div className="p-4 mb-4 border border-indigo-200 bg-indigo-50/40 rounded-xl space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Add site manually</p>
          <input
            type="text"
            value={manualSiteName}
            onChange={(e) => setManualSiteName(e.target.value)}
            placeholder="Site name"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
          <input
            type="text"
            value={manualSiteLink}
            onChange={(e) => setManualSiteLink(e.target.value)}
            placeholder="Site URL (optional, e.g. example.com)"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={addManualSite}
              disabled={isSavingManualSite || !manualSiteName.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
            >
              {isSavingManualSite ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
              Add Site
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAddingManualSite(false);
                setManualSiteName("");
                setManualSiteLink("");
                setManualSiteError(null);
              }}
              disabled={isSavingManualSite}
              className="px-4 py-2 text-gray-500 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsAddingManualSite(true)}
          className="w-full flex items-center justify-center gap-2 p-3 mb-4 rounded-xl border border-dashed border-gray-300 text-sm font-medium text-gray-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all"
        >
          <PlusCircle className="w-4 h-4" /> Can't find your site? Add it manually
        </button>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : sitesError ? (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">
          {sitesError}
        </div>
      ) : (
        <div className="space-y-2.5">
          {sortedSites.map((site) => {
            const key = site.name.toLowerCase();
            const isChecked = currentPeriodSites.has(key);
            const lastReview = latestBySite[key];
            const isToggling = togglingSite === key;

            return (
              <div
                key={site.name}
                className={`flex items-center gap-4 p-4 rounded-2xl border shadow-sm transition-all ${
                  isChecked
                    ? "bg-emerald-50/50 border-emerald-200"
                    : "bg-white border-gray-200 hover:border-blue-200"
                }`}
              >
                <button
                  onClick={() => toggleReview(site)}
                  disabled={isToggling}
                  className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${
                    isChecked
                      ? "bg-emerald-500 border-emerald-500"
                      : "border-gray-300 hover:border-blue-400 bg-white"
                  } disabled:opacity-50`}
                  title={isChecked ? "Mark as not reviewed" : "Mark as reviewed"}
                >
                  {isToggling ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                  ) : isChecked ? (
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  ) : null}
                </button>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                    {site.name}
                    {site.status === "manual" && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                        Manual
                      </span>
                    )}
                  </p>
                  {site.domain && (
                    <a
                      href={site.domain}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1 mt-0.5 truncate"
                    >
                      <Globe className="w-3 h-3 shrink-0" /> {site.domain}
                    </a>
                  )}
                </div>

                <div className="text-right shrink-0">
                  {lastReview ? (
                    <>
                      <p className="text-xs font-bold text-gray-700">{lastReview.checked_by_name}</p>
                      <p className="text-[11px] text-gray-400">{daysAgo(lastReview.checked_at)}</p>
                    </>
                  ) : (
                    <p className="text-[11px] font-medium text-amber-600 uppercase tracking-wider">
                      Never reviewed
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          {sortedSites.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-10">No live sites match your search.</p>
          )}
        </div>
      )}
    </main>
  );
}
