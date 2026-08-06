"use client";

import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";

type DateFilter = "today" | "week" | "all";

function isWithinDays(dateStr: string, days: number) {
  const date = new Date(dateStr);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return date >= cutoff;
}

export default function EodOverviewPage() {
  const { role, loading: authLoading } = useAuth();
  const canView = role === "admin" || role === "manager";

  const [reports, setReports] = useState<EodReportWithEntries[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (canView) fetchReports();
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

  const toggleExpanded = (id: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredReports = useMemo(() => {
    // Hide empty drafts (someone opened /eod but never added anything) — they're
    // just noise here, not real activity.
    const withActivity = reports.filter((r) => r.eod_entries.length > 0);
    if (dateFilter === "all") return withActivity;
    const days = dateFilter === "today" ? 1 : 7;
    return withActivity.filter((r) => isWithinDays(r.report_date, days));
  }, [reports, dateFilter]);

  const groupedByDate = useMemo(() => {
    const groups: Record<string, EodReportWithEntries[]> = {};
    for (const report of filteredReports) {
      if (!groups[report.report_date]) groups[report.report_date] = [];
      groups[report.report_date].push(report);
    }
    return Object.entries(groups).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filteredReports]);

  if (authLoading || isLoading) {
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
        <p className="text-gray-600">Only Admin and Manager can view the EOD overview.</p>
      </div>
    );
  }

  return (
    <main className="p-4 sm:p-8 max-w-5xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-teal-600 text-white rounded-xl shadow-sm">
            <ListChecks className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">EOD Overview</h1>
            <p className="text-gray-500 text-sm mt-1">All developer and manager end-of-day reports.</p>
          </div>
        </div>

        <div className="flex gap-2">
          {(["today", "week", "all"] as DateFilter[]).map((filter) => (
            <button
              key={filter}
              onClick={() => setDateFilter(filter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                dateFilter === filter
                  ? "bg-teal-600 text-white"
                  : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {groupedByDate.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-10 text-center">
          <p className="text-gray-500">No EOD reports for this range.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groupedByDate.map(([date, dateReports]) => (
            <div key={date}>
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">{date}</h2>
              <div className="flex flex-col gap-3">
                {dateReports.map((report) => {
                  const isOpen = expanded.has(report.id);
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

                  return (
                    <div key={report.id} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                      <button
                        onClick={() => toggleExpanded(report.id)}
                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          {isOpen ? (
                            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                          )}
                          <div>
                            <p className="font-bold text-gray-900">{report.team_member_name}</p>
                            <p className="text-xs text-gray-400">
                              {report.eod_entries.length} page{report.eod_entries.length === 1 ? "" : "s"} across{" "}
                              {entriesBySite.length} site{entriesBySite.length === 1 ? "" : "s"}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full flex items-center gap-1 shrink-0 ${
                            report.status === "submitted"
                              ? "text-emerald-600 bg-emerald-50 border border-emerald-100"
                              : "text-amber-600 bg-amber-50 border border-amber-100"
                          }`}
                        >
                          {report.status === "submitted" ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <Clock className="w-3 h-3" />
                          )}
                          {report.status === "submitted" ? "Submitted" : "In Progress"}
                        </span>
                      </button>

                      {isOpen && (
                        <div className="border-t border-gray-100 divide-y divide-gray-100">
                          {entriesBySite.map((group) => {
                            const siteDomain = group.items[0]?.site_domain;
                            return (
                              <div key={group.siteName} className="px-5 py-3">
                                <p className="text-sm font-bold text-gray-800 mb-2">
                                  {siteDomain ? (
                                    <a
                                      href={siteDomain}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="hover:text-blue-600 hover:underline"
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
                                      <p className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                                        {entry.page_url ? (
                                          <a
                                            href={entry.page_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="hover:text-blue-600 hover:underline"
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
                                      <p className="text-xs text-gray-500 mt-0.5">{entry.notes}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
