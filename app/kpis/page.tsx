"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { calculateBusinessDuration, formatBusinessDuration } from "@/lib/businessTime";
import type { TaskRevision } from "@/type/taskRevision";
import type { ProductionBug } from "@/type/productionBug";
import {
  Loader2,
  ShieldAlert,
  BarChart3,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  Bug,
  User as UserIcon,
} from "lucide-react";

type TeamMember = { name: string; email: string; role: string };

function monthLabel(date: Date): string {
  return date.toLocaleString(undefined, { month: "long", year: "numeric" });
}

function monthRange(date: Date): { start: string; end: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function daysAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

type PersonKpi = {
  name: string;
  email: string;
  revisions: TaskRevision[];
  bugs: ProductionBug[];
};

export default function KpisPage() {
  const { role, loading: authLoading } = useAuth();
  const canView = role === "admin" || role === "manager" || role === "hr";

  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [revisions, setRevisions] = useState<TaskRevision[]>([]);
  const [bugs, setBugs] = useState<ProductionBug[]>([]);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function loadTeamMembers() {
    const { data } = await supabase
      .from("team_members")
      .select("name, email, role")
      .neq("role", "admin")
      .order("name", { ascending: true });
    setTeamMembers((data as TeamMember[]) || []);
  }

  async function loadHolidays() {
    const { data } = await supabase.from("company_holidays").select("date");
    if (data) setHolidays(new Set(data.map((h: { date: string }) => h.date)));
  }

  async function loadMonthData() {
    setIsLoading(true);
    const { start, end } = monthRange(monthCursor);

    const [revisionsResult, bugsResult] = await Promise.all([
      supabase
        .from("task_revisions")
        .select("*")
        .gte("created_at", start)
        .lt("created_at", end)
        .order("created_at", { ascending: false }),
      supabase
        .from("production_bugs")
        .select("*")
        .gte("created_at", start)
        .lt("created_at", end)
        .order("created_at", { ascending: false }),
    ]);

    setRevisions((revisionsResult.data as TaskRevision[]) || []);
    setBugs((bugsResult.data as ProductionBug[]) || []);
    setIsLoading(false);
  }

  useEffect(() => {
    if (canView) {
      loadTeamMembers();
      loadHolidays();
    }
  }, [canView]);

  useEffect(() => {
    if (canView) loadMonthData();
  }, [canView, monthCursor]);

  const toggleExpanded = (email: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const people = useMemo<PersonKpi[]>(() => {
    const byEmail: Record<string, PersonKpi> = {};

    for (const m of teamMembers) {
      byEmail[m.email] = { name: m.name, email: m.email, revisions: [], bugs: [] };
    }
    for (const r of revisions) {
      if (!byEmail[r.assignee_email]) {
        byEmail[r.assignee_email] = { name: r.assignee_name, email: r.assignee_email, revisions: [], bugs: [] };
      }
      byEmail[r.assignee_email].revisions.push(r);
    }
    for (const b of bugs) {
      if (!byEmail[b.developer_email]) {
        byEmail[b.developer_email] = { name: b.developer_name, email: b.developer_email, revisions: [], bugs: [] };
      }
      byEmail[b.developer_email].bugs.push(b);
    }

    return Object.values(byEmail).sort((a, b) => a.name.localeCompare(b.name));
  }, [teamMembers, revisions, bugs]);

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
        <p className="text-gray-600">Only Admin, Manager, and HR can view KPIs.</p>
      </div>
    );
  }

  return (
    <main className="p-4 sm:p-8 max-w-4xl mx-auto w-full">
      <Link
        href="/dashboard"
        className="inline-flex items-center text-sm text-[var(--accent)] hover:opacity-80 mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
      </Link>

      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-sm">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-[var(--bg-foreground)]">KPIs</h1>
            <p className="text-[var(--bg-muted)] text-sm mt-1">
              Revisions and production bugs, per person, per month.{" "}
              <Link href="/production-bugs" className="text-[var(--accent)] hover:opacity-80 font-semibold">
                View Production Bugs →
              </Link>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-[var(--card)] border border-[var(--card-border)] rounded-xl shadow-sm p-1">
          <button
            type="button"
            onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            className="p-2 rounded-lg hover:bg-gray-100 text-[var(--card-muted)]"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold text-[var(--card-foreground)] px-2 min-w-[140px] text-center">
            {monthLabel(monthCursor)}
          </span>
          <button
            type="button"
            onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            className="p-2 rounded-lg hover:bg-gray-100 text-[var(--card-muted)]"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
        </div>
      ) : people.length === 0 ? (
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-sm p-10 text-center">
          <p className="text-[var(--card-muted)]">No team members found.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {people.map((person) => {
            const isOpen = expanded.has(person.email);
            const revisionCount = person.revisions.length;
            const bugCount = person.bugs.length;

            return (
              <div key={person.email} className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden">
                <button
                  onClick={() => toggleExpanded(person.email)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                    <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0 text-sm">
                      {person.name ? person.name.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
                    </div>
                    <p className="font-bold text-[var(--card-foreground)]">{person.name}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full flex items-center gap-1 border ${
                        revisionCount > 0
                          ? "text-violet-600 bg-violet-50 border-violet-100"
                          : "text-gray-400 bg-gray-50 border-gray-100"
                      }`}
                    >
                      <RotateCcw className="w-3 h-3" /> {revisionCount} revision{revisionCount === 1 ? "" : "s"}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full flex items-center gap-1 border ${
                        bugCount > 0
                          ? "text-rose-600 bg-rose-50 border-rose-100"
                          : "text-gray-400 bg-gray-50 border-gray-100"
                      }`}
                    >
                      <Bug className="w-3 h-3" /> {bugCount} bug{bugCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </button>

                {isOpen && (revisionCount > 0 || bugCount > 0) && (
                  <div className="border-t border-gray-100 divide-y divide-gray-100">
                    {person.revisions.map((r) => {
                      const duration = r.resolved_at
                        ? formatBusinessDuration(
                            calculateBusinessDuration(new Date(r.created_at), new Date(r.resolved_at), holidays),
                            true
                          )
                        : formatBusinessDuration(calculateBusinessDuration(new Date(r.created_at), new Date(), holidays));

                      return (
                        <div key={`rev-${r.id}`} className="px-5 py-3">
                          <p className="text-sm font-bold text-[var(--card-foreground)] flex items-center gap-1.5 flex-wrap">
                            <RotateCcw className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                            <Link href={`/tasks?taskId=${r.task_id}`} className="hover:text-[var(--accent)] hover:underline">
                              {r.task_title}
                            </Link>
                            {!r.resolved_at && (
                              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                                Still In Revision
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-[var(--card-muted)] mt-1">
                            requested by {r.requested_by_name} · {daysAgo(r.created_at)} · {r.resolved_at ? "took" : "ongoing"} {duration}
                          </p>
                          <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">{r.reason}</p>
                        </div>
                      );
                    })}
                    {person.bugs.map((b) => (
                      <div key={`bug-${b.id}`} className="px-5 py-3">
                        <p className="text-sm font-bold text-[var(--card-foreground)] flex items-center gap-1.5">
                          <Bug className="w-3.5 h-3.5 text-rose-500 shrink-0" /> {b.title}
                          <span
                            className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                              b.status === "fixed" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600"
                            }`}
                          >
                            {b.status === "fixed" ? "Fixed" : "Open"}
                          </span>
                        </p>
                        <p className="text-xs text-[var(--card-muted)] mt-1">
                          reported by {b.reported_by_name} · {daysAgo(b.created_at)}
                          {b.site_name && (
                            <>
                              {" · "}
                              {b.site_domain ? (
                                <a
                                  href={b.site_domain}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="hover:text-[var(--accent)] hover:underline"
                                >
                                  {b.site_name}
                                </a>
                              ) : (
                                b.site_name
                              )}
                            </>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
