"use client";

import { useEffect, useState } from "react";
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
  ChevronDown,
  ChevronRight,
  Gauge,
} from "lucide-react";

// A site only counts as "reviewed" once every item here is checked, and it
// stays reviewed for a rolling 15 days from whenever the last item was
// checked — then it's automatically due again.
const REVIEW_CHECKLIST_ITEMS = [
  "Responsiveness",
  "Forms Testing",
  "Broken Links",
  "Gallery Light Box",
  "New Reviews",
  "Web Archive Snapshot",
  "WordPress Version Update",
  "Plugins Update",
  "Theme Update",
];

const REVIEW_VALID_DAYS = 15;
const DAY_MS = 1000 * 60 * 60 * 24;

function normalizeSiteLink(link: string): string {
  const trimmed = link.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function daysAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diffMs / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

type SiteReviewState = {
  itemRows: Map<string, SiteReview>;
  checkedCount: number;
  completedAt: string | null; // when the set last became fully complete
  daysSinceCompleted: number | null;
  isExpired: boolean; // was complete, but the 15-day window has passed
  isFullyReviewed: boolean; // complete AND not expired
  daysUntilDue: number | null;
  daysOverdue: number | null;
};

function computeSiteReviewState(rows: SiteReview[]): SiteReviewState {
  const itemRows = new Map<string, SiteReview>();
  for (const row of rows) {
    if (REVIEW_CHECKLIST_ITEMS.includes(row.checklist_item)) {
      itemRows.set(row.checklist_item, row);
    }
  }

  const checkedCount = itemRows.size;
  const isComplete = checkedCount === REVIEW_CHECKLIST_ITEMS.length;

  let completedAt: string | null = null;
  if (isComplete) {
    completedAt = [...itemRows.values()]
      .map((r) => r.checked_at)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  }

  const daysSinceCompleted = completedAt
    ? Math.floor((Date.now() - new Date(completedAt).getTime()) / DAY_MS)
    : null;
  const isExpired = daysSinceCompleted !== null && daysSinceCompleted >= REVIEW_VALID_DAYS;
  const isFullyReviewed = isComplete && !isExpired;
  const daysUntilDue = isFullyReviewed ? REVIEW_VALID_DAYS - (daysSinceCompleted ?? 0) : null;
  const daysOverdue = isExpired ? (daysSinceCompleted ?? 0) - REVIEW_VALID_DAYS : null;

  return {
    itemRows,
    checkedCount,
    completedAt,
    daysSinceCompleted,
    isExpired,
    isFullyReviewed,
    daysUntilDue,
    daysOverdue,
  };
}

export default function SiteReviewsClient() {
  const { role, name, email, loading: authLoading } = useAuth();
  const canView = role === "developer" || role === "manager" || role === "admin";

  const [sites, setSites] = useState<EodSiteOption[]>([]);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [isLoadingSites, setIsLoadingSites] = useState(true);

  const [reviewStateBySite, setReviewStateBySite] = useState<Record<string, SiteReviewState>>({});
  const [lastActivityBySite, setLastActivityBySite] = useState<Record<string, SiteReview>>({});
  const [isLoadingReviews, setIsLoadingReviews] = useState(true);

  const [search, setSearch] = useState("");
  const [expandedSites, setExpandedSites] = useState<Set<string>>(new Set());
  const [togglingItem, setTogglingItem] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const [isAddingManualSite, setIsAddingManualSite] = useState(false);
  const [manualSiteName, setManualSiteName] = useState("");
  const [manualSiteLink, setManualSiteLink] = useState("");
  const [isSavingManualSite, setIsSavingManualSite] = useState(false);
  const [manualSiteError, setManualSiteError] = useState<string | null>(null);

  useEffect(() => {
    if (canView) {
      loadSites();
      loadReviews();
    }
  }, [canView]);

  const loadSites = async () => {
    setIsLoadingSites(true);
    setSitesError(null);

    try {
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
    } catch {
      setSitesError("Could not load site list — check sheet connectivity.");
    } finally {
      setIsLoadingSites(false);
    }
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
    const { data } = await supabase.from("site_reviews").select("*");

    const bySite: Record<string, SiteReview[]> = {};
    ((data as SiteReview[]) || []).forEach((row) => {
      const key = row.site_name.toLowerCase();
      if (!bySite[key]) bySite[key] = [];
      bySite[key].push(row);
    });

    const states: Record<string, SiteReviewState> = {};
    const lastActivity: Record<string, SiteReview> = {};
    for (const [key, rows] of Object.entries(bySite)) {
      states[key] = computeSiteReviewState(rows);
      const relevant = rows.filter((r) => REVIEW_CHECKLIST_ITEMS.includes(r.checklist_item));
      if (relevant.length > 0) {
        lastActivity[key] = relevant.sort(
          (a, b) => new Date(b.checked_at).getTime() - new Date(a.checked_at).getTime()
        )[0];
      }
    }

    setReviewStateBySite(states);
    setLastActivityBySite(lastActivity);
    setIsLoadingReviews(false);
  };

  const toggleExpanded = (key: string) => {
    setExpandedSites((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isItemChecked = (site: EodSiteOption, item: string): boolean => {
    const key = site.name.toLowerCase();
    const state = reviewStateBySite[key];
    if (!state) return false;
    // Once the set has been complete for 15+ days, treat everything as reset
    // for display — checking any item again starts a fresh cycle.
    if (state.isExpired) return false;
    return state.itemRows.has(item);
  };

  const toggleChecklistItem = async (site: EodSiteOption, item: string) => {
    const key = site.name.toLowerCase();
    const isChecked = isItemChecked(site, item);
    const togglingKey = `${key}|${item}`;
    setTogglingItem(togglingKey);
    setToggleError(null);

    const { error } = isChecked
      ? await supabase
          .from("site_reviews")
          .delete()
          .eq("site_name", site.name)
          .eq("checklist_item", item)
      : await supabase.from("site_reviews").upsert(
          {
            site_name: site.name,
            site_domain: site.domain,
            checklist_item: item,
            checked_by_name: name || "Unknown Operator",
            checked_by_email: email || "",
            checked_at: new Date().toISOString(),
          },
          { onConflict: "site_name,checklist_item" }
        );

    if (error) {
      setToggleError(`Couldn't save "${item}" for "${site.name}": ${error.message}`);
      setTogglingItem(null);
      return;
    }

    await loadReviews();
    setTogglingItem(null);
  };

  const getState = (site: EodSiteOption) => reviewStateBySite[site.name.toLowerCase()];
  const isSiteFullyReviewed = (site: EodSiteOption) => getState(site)?.isFullyReviewed ?? false;

  const filteredSites = sites.filter((s) =>
    s.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const sortedSites = [...filteredSites].sort((a, b) => {
    const aChecked = isSiteFullyReviewed(a);
    const bChecked = isSiteFullyReviewed(b);
    if (aChecked !== bChecked) return aChecked ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  const reviewedCount = sites.filter(isSiteFullyReviewed).length;
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

      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-sm">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Site Reviews</h1>
            <p className="text-gray-500 text-sm mt-1">Reviewed every {REVIEW_VALID_DAYS} days</p>
          </div>
        </div>

        <Link
          href="/website-speeds"
          className="inline-flex items-center gap-2 h-11 px-5 rounded-2xl bg-emerald-600 text-white text-sm font-semibold shadow-[0_10px_30px_rgba(5,150,105,0.18)] transition hover:-translate-y-0.5 hover:bg-emerald-700 shrink-0"
        >
          <Gauge className="w-4 h-4" /> Website Speeds
        </Link>
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
              {reviewedCount} of {totalCount} sites up to date
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
            const state = getState(site);
            const isFullyReviewed = state?.isFullyReviewed ?? false;
            const isOverdue = state?.isExpired ?? false;
            const checkedCount = isOverdue
              ? 0
              : REVIEW_CHECKLIST_ITEMS.filter((item) => isItemChecked(site, item)).length;
            const lastActivity = lastActivityBySite[key];
            const isOpen = expandedSites.has(key);

            return (
              <div
                key={site.name}
                className={`rounded-2xl border shadow-sm transition-all overflow-hidden ${
                  isFullyReviewed
                    ? "bg-emerald-50/50 border-emerald-200"
                    : isOverdue
                    ? "bg-rose-50/40 border-rose-200"
                    : "bg-white border-gray-200 hover:border-blue-200"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleExpanded(key)}
                  className="w-full flex items-center gap-4 p-4 text-left"
                >
                  <div
                    className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 ${
                      isFullyReviewed ? "bg-emerald-500 border-emerald-500" : "border-gray-300"
                    }`}
                  >
                    {isFullyReviewed && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5 flex-wrap">
                      {site.name}
                      {site.status === "manual" && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                          Manual
                        </span>
                      )}
                      {isFullyReviewed ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          Due in {state!.daysUntilDue}d
                        </span>
                      ) : isOverdue ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">
                          Review Overdue
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          {checkedCount}/{REVIEW_CHECKLIST_ITEMS.length} checks
                        </span>
                      )}
                    </p>
                    {site.domain && (
                      <a
                        href={site.domain}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1 mt-0.5 truncate w-fit"
                      >
                        <Globe className="w-3 h-3 shrink-0" /> {site.domain}
                      </a>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    {lastActivity ? (
                      <>
                        <p className="text-xs font-bold text-gray-700">{lastActivity.checked_by_name}</p>
                        <p className="text-[11px] text-gray-400">{daysAgo(lastActivity.checked_at)}</p>
                      </>
                    ) : (
                      <p className="text-[11px] font-medium text-amber-600 uppercase tracking-wider">
                        Never reviewed
                      </p>
                    )}
                  </div>

                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                  )}
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 divide-y divide-gray-100">
                    {isOverdue && (
                      <p className="px-4 py-2.5 text-xs text-rose-700 bg-rose-50/60">
                        This review expired {state!.daysOverdue === 0 ? "today" : `${state!.daysOverdue} day${state!.daysOverdue === 1 ? "" : "s"} ago`} — check items below to start a new cycle.
                      </p>
                    )}
                    {REVIEW_CHECKLIST_ITEMS.map((item) => {
                      const itemChecked = isItemChecked(site, item);
                      const isToggling = togglingItem === `${key}|${item}`;

                      return (
                        <label
                          key={item}
                          className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={itemChecked}
                            disabled={isToggling}
                            onChange={() => toggleChecklistItem(site, item)}
                            className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                          />
                          <span
                            className={`text-sm flex-1 ${
                              itemChecked ? "text-gray-500 line-through" : "text-gray-700 font-medium"
                            }`}
                          >
                            {item}
                          </span>
                          {isToggling && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                        </label>
                      );
                    })}
                  </div>
                )}
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
