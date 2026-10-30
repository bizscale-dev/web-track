"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import type { EodReportWithEntries } from "@/type/eod";
import {
  Loader2,
  ShieldAlert,
  ListChecks,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
  ArrowLeft,
  ClipboardCheck,
  Search,
  ClipboardList,
  AlertTriangle,
  User as UserIcon,
  ChevronsUpDown,
  Globe,
  FileText,
  Sparkles,
} from "lucide-react";

type DateFilter = "today" | "week" | "all";
type StatusFilter = "all" | "submitted" | "draft";
type TeamMember = { email: string; name: string; role: string; avatar_url: string | null };

function isWithinDays(dateStr: string, days: number) {
  const date = new Date(dateStr);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return date >= cutoff;
}

function formatRole(r: string | undefined) {
  return r ? r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Team Member";
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

const DATE_FILTER_LABEL: Record<DateFilter, string> = {
  today: "Today",
  week: "This Week",
  all: "All Time",
};

export default function EodOverviewPage() {
  const { role, loading: authLoading } = useAuth();
  const canView = role === "admin" || role === "manager" || role === "hr" || role === "designer";

  const [reports, setReports] = useState<EodReportWithEntries[]>([]);
  const [teamByEmail, setTeamByEmail] = useState<Record<string, TeamMember>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (canView) {
      fetchReports();
      fetchTeamMembers();
    }
  }, [canView]);

  const fetchReports = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("eod_reports")
      .select("*, eod_entries(*)")
      .order("report_date", { ascending: false })
      .order("team_member_name", { ascending: true });

    if (!error && data) setReports(data as EodReportWithEntries[]);
    setIsLoading(false);
  };

  const fetchTeamMembers = async () => {
    const { data } = await supabase.from("team_members").select("email, name, role, avatar_url");
    const map: Record<string, TeamMember> = {};
    for (const m of (data as TeamMember[]) || []) map[m.email] = m;
    setTeamByEmail(map);
  };

  const toggleExpanded = (id: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (ids: number[]) => {
    setExpanded((current) => {
      const allOpen = ids.every((id) => current.has(id));
      return allOpen ? new Set() : new Set(ids);
    });
  };

  const today = new Date().toISOString().slice(0, 10);

  const filteredReports = useMemo(() => {
    // Hide empty drafts (someone opened /eod but never added anything) — they're
    // just noise here, not real activity.
    let list = reports.filter((r) => r.eod_entries.length > 0);

    if (dateFilter !== "all") {
      const days = dateFilter === "today" ? 1 : 7;
      list = list.filter((r) => isWithinDays(r.report_date, days));
    }

    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.team_member_name.toLowerCase().includes(q) ||
          r.eod_entries.some(
            (e) =>
              e.page_label.toLowerCase().includes(q) ||
              e.site_name.toLowerCase().includes(q) ||
              e.notes.toLowerCase().includes(q)
          )
      );
    }

    return list;
  }, [reports, dateFilter, statusFilter, searchQuery]);

  const groupedByDate = useMemo(() => {
    const groups: Record<string, EodReportWithEntries[]> = {};
    for (const report of filteredReports) {
      if (!groups[report.report_date]) groups[report.report_date] = [];
      groups[report.report_date].push(report);
    }
    return Object.entries(groups).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filteredReports]);

  const summary = useMemo(() => {
    const total = filteredReports.length;
    const submitted = filteredReports.filter((r) => r.status === "submitted").length;
    const inProgress = filteredReports.filter((r) => r.status === "draft" && r.report_date === today).length;
    const actionRequired = filteredReports.filter((r) => r.status === "draft" && r.report_date < today).length;
    const submittedPct = total > 0 ? Math.round((submitted / total) * 100) : 0;
    return { total, submitted, inProgress, actionRequired, submittedPct };
  }, [filteredReports, today]);

  const filtersActive = !!searchQuery || statusFilter !== "all" || dateFilter !== "all";

  if (authLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="p-10 max-w-2xl mx-auto text-center mt-20 bg-rose-50 border border-rose-100 rounded-2xl">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Clearance Required</h1>
        <p className="text-gray-600">Only Admin, Manager, HR, and Designer can view the EOD overview.</p>
      </div>
    );
  }

  return (
    <main className="max-w-[1600px] mx-auto w-full p-4 sm:p-6 lg:p-8">
      {role === "hr" || role === "designer" ? (
        <Link
          href="/tasks/overview"
          className="inline-flex items-center text-sm text-[var(--accent)] hover:opacity-80 mb-4 transition-colors"
        >
          <ClipboardCheck className="w-4 h-4 mr-1" /> View Tasks Overview
        </Link>
      ) : (
        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm text-[var(--accent)] hover:opacity-80 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
        </Link>
      )}

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-teal-600 text-white rounded-2xl shadow-[0_8px_20px_-6px_rgba(13,148,136,0.5)]">
            <ListChecks className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-[var(--bg-foreground)] flex items-center gap-2 flex-wrap">
              EOD Overview
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Sync
              </span>
            </h1>
            <p className="text-[var(--bg-muted)] text-sm mt-1">
              Review employee daily activity and end-of-day reports — all submissions in one place.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-[var(--card)] border border-[var(--card-border)] rounded-full shadow-sm p-1">
          {(["today", "week", "all"] as DateFilter[]).map((filter) => (
            <button
              key={filter}
              onClick={() => setDateFilter(filter)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors ${
                dateFilter === filter
                  ? "bg-[var(--button)] text-[var(--button-text)]"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_20px_-10px_rgba(15,23,42,0.12)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)]">Total Submissions</p>
                <p className="text-3xl font-black text-[var(--card-foreground)] leading-none mt-2">{summary.total}</p>
              </div>
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 text-slate-600 shrink-0">
                <ClipboardList className="w-5 h-5" />
              </span>
            </div>
            <p className="text-[11px] text-[var(--card-muted)] mt-2">Across the current scope</p>
          </div>

          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_20px_-10px_rgba(15,23,42,0.12)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)]">Submitted</p>
                <p className="text-3xl font-black text-[var(--card-foreground)] leading-none mt-2">{summary.submitted}</p>
              </div>
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-emerald-50 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${summary.submittedPct}%` }} />
            </div>
            <p className="text-[11px] text-emerald-600 font-semibold mt-1">{summary.submittedPct}% submitted</p>
          </div>

          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_20px_-10px_rgba(15,23,42,0.12)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)]">In Progress</p>
                <p className="text-3xl font-black text-[var(--card-foreground)] leading-none mt-2">{summary.inProgress}</p>
              </div>
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 text-blue-600 shrink-0">
                <Clock className="w-5 h-5" />
              </span>
            </div>
            <p className="text-[11px] text-[var(--card-muted)] mt-2">Drafts active today</p>
          </div>

          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_20px_-10px_rgba(15,23,42,0.12)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)]">Action Required</p>
                <p className="text-3xl font-black text-[var(--card-foreground)] leading-none mt-2">{summary.actionRequired}</p>
              </div>
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-rose-50 text-rose-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </span>
            </div>
            {summary.actionRequired > 0 ? (
              <p className="text-[11px] text-rose-600 font-semibold mt-2">Still drafts from a past day</p>
            ) : (
              <p className="text-[11px] text-[var(--card-muted)] mt-2">Nothing overdue</p>
            )}
          </div>
        </div>
      )}

      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_24px_-12px_rgba(15,23,42,0.1)] p-4 mb-5 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search employee name, page, or keyword..."
              className="w-full pl-10 pr-3 py-2.5 text-sm border border-slate-200 rounded-full bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] focus:bg-white transition-colors"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-4 py-2.5 text-sm font-semibold border border-slate-200 rounded-full bg-slate-50 text-slate-600 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
          >
            <option value="all">All Submission Statuses</option>
            <option value="submitted">Submitted</option>
            <option value="draft">In Progress</option>
          </select>
          <button
            type="button"
            onClick={() => toggleAll(filteredReports.map((r) => r.id))}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border border-slate-200 rounded-full bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
          >
            <ChevronsUpDown className="w-4 h-4" /> Toggle All
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--card-muted)] mr-1">
            Active Criteria:
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-100">
            Timeframe: {DATE_FILTER_LABEL[dateFilter]}
          </span>
          {statusFilter !== "all" && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-100">
              Status: {statusFilter === "submitted" ? "Submitted" : "In Progress"}
            </span>
          )}
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
                setDateFilter("all");
              }}
              className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)] hover:opacity-80 px-2 py-1"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
        </div>
      ) : groupedByDate.length === 0 ? (
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-sm p-10 text-center">
          <p className="text-[var(--card-muted)]">No EOD reports for this range.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groupedByDate.map(([date, dateReports]) => {
            const isToday = date === today;
            const dayLabel = new Date(date).toLocaleDateString([], { weekday: "long" });
            return (
              <div key={date}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-black text-[var(--bg-foreground)] flex items-center gap-2">
                    {date}
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      {isToday ? `Today · ${dayLabel}` : dayLabel}
                    </span>
                  </h2>
                  <p className="text-xs font-semibold text-[var(--bg-muted)]">
                    {dateReports.length} report{dateReports.length === 1 ? "" : "s"} recorded
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  {dateReports.map((report) => {
                    const isOpen = expanded.has(report.id);
                    const member = teamByEmail[report.team_member_email];
                    const entriesBySite = Object.values(
                      report.eod_entries.reduce(
                        (groups: Record<string, { siteName: string; items: typeof report.eod_entries }>, entry) => {
                          if (!groups[entry.site_name]) groups[entry.site_name] = { siteName: entry.site_name, items: [] };
                          groups[entry.site_name].items.push(entry);
                          return groups;
                        },
                        {}
                      )
                    );
                    const newPageCount = report.eod_entries.filter((e) => e.is_new_page).length;
                    const isOverdueDraft = report.status === "draft" && report.report_date < today;

                    return (
                      <div
                        key={report.id}
                        className={`bg-[var(--card)] border rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_18px_-10px_rgba(15,23,42,0.1)] overflow-hidden transition-shadow hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_28px_-10px_rgba(15,23,42,0.16)] ${
                          isOverdueDraft ? "border-rose-200" : "border-[var(--card-border)]"
                        }`}
                      >
                        <button
                          onClick={() => toggleExpanded(report.id)}
                          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors text-left gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {isOpen ? (
                              <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                            )}
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-500 to-teal-700 text-white font-bold flex items-center justify-center shrink-0 text-sm overflow-hidden ring-2 ring-white shadow-sm">
                              {member?.avatar_url ? (
                                <img src={member.avatar_url} alt={report.team_member_name} className="w-full h-full object-cover" />
                              ) : report.team_member_name ? (
                                report.team_member_name.charAt(0).toUpperCase()
                              ) : (
                                <UserIcon className="w-4 h-4" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-[var(--card-foreground)]">{report.team_member_name}</p>
                                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                                  {formatRole(member?.role)}
                                </span>
                              </div>
                              <p className="text-xs text-[var(--card-muted)] truncate">
                                {report.eod_entries.length} page{report.eod_entries.length === 1 ? "" : "s"} across {entriesBySite.length} site
                                {entriesBySite.length === 1 ? "" : "s"} ·{" "}
                                {report.status === "submitted" && report.submitted_at
                                  ? `Submitted ${formatTime(report.submitted_at)}`
                                  : "Draft in progress"}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full flex items-center gap-1 shrink-0 ${
                              report.status === "submitted"
                                ? "text-emerald-600 bg-emerald-50 border border-emerald-100"
                                : isOverdueDraft
                                ? "text-rose-600 bg-rose-50 border border-rose-100"
                                : "text-amber-600 bg-amber-50 border border-amber-100"
                            }`}
                          >
                            {report.status === "submitted" ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                            {report.status === "submitted" ? "Submitted" : isOverdueDraft ? "Past Due" : "In Progress"}
                          </span>
                        </button>

                        {isOpen && (
                          <>
                            <div className="flex flex-wrap items-center gap-1.5 px-5 pb-3">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-slate-50 text-slate-500 border border-slate-100">
                                <Globe className="w-3 h-3" /> {entriesBySite.length} Site{entriesBySite.length === 1 ? "" : "s"}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-slate-50 text-slate-500 border border-slate-100">
                                <FileText className="w-3 h-3" /> {report.eod_entries.length} Page{report.eod_entries.length === 1 ? "" : "s"}
                              </span>
                              {newPageCount > 0 && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-purple-50 text-purple-600 border border-purple-100">
                                  <Sparkles className="w-3 h-3" /> {newPageCount} New
                                </span>
                              )}
                            </div>
                            <div className="border-t border-gray-100 divide-y divide-gray-100">
                              {entriesBySite.map((group) => {
                                const siteDomain = group.items[0]?.site_domain;
                                return (
                                  <div key={group.siteName} className="px-5 py-3">
                                    <p className="text-sm font-bold text-[var(--card-foreground)] mb-2">
                                      {siteDomain ? (
                                        <a
                                          href={siteDomain}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="hover:text-[var(--accent)] hover:underline"
                                        >
                                          {group.siteName}
                                        </a>
                                      ) : (
                                        group.siteName
                                      )}
                                    </p>
                                    <div className="space-y-2 pl-2 border-l-2 border-gray-100">
                                      {group.items.map((entry) => (
                                        <div key={entry.id} className="pl-3">
                                          <p className="text-xs font-medium text-[var(--card-foreground)] flex items-center gap-1.5">
                                            {entry.page_url ? (
                                              <a
                                                href={entry.page_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="hover:text-[var(--accent)] hover:underline"
                                              >
                                                {entry.page_label}
                                              </a>
                                            ) : (
                                              entry.page_label
                                            )}
                                            {entry.is_new_page && (
                                              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">
                                                New
                                              </span>
                                            )}
                                          </p>
                                          <p className="text-xs text-[var(--card-muted)] mt-0.5 whitespace-pre-wrap">{entry.notes}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
