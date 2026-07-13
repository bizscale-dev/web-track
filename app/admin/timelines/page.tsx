"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Activity, Clock, ArrowRight, User as UserIcon, LayoutDashboard, Loader2, ArrowLeft, BarChart3, List } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

type ActivityLog = {
  id: number;
  website_id: number;
  event_type: string;
  old_value: string;
  new_value: string;
  message: string;
  changed_by_email: string;
  created_at: string;
  websites: {
    website_name: string;
    created_at: string;
  } | null;
};

export default function TimelinesPage() {
  const { role, loading: authLoading } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [viewMode, setViewMode] = useState<"timeline" | "velocity">("timeline");

  useEffect(() => {
    async function fetchForensicsData() {
      const { data: logsData, error: logsError } = await supabase
        .from("website_activity_logs")
        .select(`
          *,
          websites (
            website_name,
            created_at
          )
        `)
        .order("created_at", { ascending: false })
        .limit(300);

      if (logsError) {
        setError(logsError.message);
      } else {
        setLogs(logsData as ActivityLog[]);
      }

      const { data: holidayData } = await supabase.from("company_holidays").select("date");
      if (holidayData) {
        setHolidays(new Set(holidayData.map(h => h.date)));
      }

      setLoading(false);
    }

    fetchForensicsData();
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  };

  // --- SHIFT-BASED PRECISION ENGINE (3 PM - 12 AM) ---
  const getBusinessTimeElapsed = (startStr: string, endStr: string) => {
    const start = new Date(startStr);
    const end = new Date(endStr);
    
    if (start >= end) return "0m";

    let businessMs = 0;
    let current = new Date(start);

    while (current < end) {
      const nextHour = new Date(current);
      nextHour.setHours(current.getHours() + 1, 0, 0, 0);
      const stepEnd = nextHour < end ? nextHour : end;

      const day = current.getDay();
      const currentHour = current.getHours(); 
      
      const yyyy = current.getFullYear();
      const mm = String(current.getMonth() + 1).padStart(2, '0');
      const dd = String(current.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      // Only count if hour is 15:00 (3 PM) or later, and not a weekend/holiday
      if (day !== 0 && day !== 6 && !holidays.has(dateStr) && currentHour >= 15) {
        businessMs += stepEnd.getTime() - current.getTime();
      }
      current = stepEnd;
    }

    const NINE_HOURS_MS = 9 * 60 * 60 * 1000;
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const ONE_MINUTE_MS = 60 * 1000;

    const days = Math.floor(businessMs / NINE_HOURS_MS);
    const remainingMs = businessMs % NINE_HOURS_MS;
    
    const hours = Math.floor(remainingMs / ONE_HOUR_MS);
    const minutes = Math.floor((remainingMs % ONE_HOUR_MS) / ONE_MINUTE_MS); 
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };
  
  const groupedVelocity = useMemo(() => {
    const groups: Record<number, any> = {};
    const ascendingLogs = [...logs].reverse();

    ascendingLogs.forEach(log => {
      if (!groups[log.website_id]) {
        groups[log.website_id] = {
          website_name: log.websites?.website_name || `Website #${log.website_id}`,
          last_time: log.websites?.created_at || log.created_at,
          transitions: []
        };
      }

      const timeTaken = getBusinessTimeElapsed(groups[log.website_id].last_time, log.created_at);

      groups[log.website_id].transitions.push({
        id: log.id,
        flow: `${log.old_value || 'Creation'} -> ${log.new_value}`,
        timeTaken: timeTaken,
        timestamp: log.created_at
      });

      groups[log.website_id].last_time = log.created_at;
    });

    return Object.values(groups).sort((a, b) => a.website_name.localeCompare(b.website_name));
  }, [logs, holidays]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-700">Decrypting session...</h2>
        </div>
      </div>
    );
  }

  if (role !== "admin" && role !== "manager") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Activity className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-700">Clearance Denied</h2>
          <p className="text-slate-500 mt-2">You do not have access to the Forensics Timeline.</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 bg-white p-6 rounded-[24px] shadow-sm border border-slate-200">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 mb-3">
              <Activity className="h-3.5 w-3.5" />
              System Forensics
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Activity Timeline</h1>
            <p className="text-sm text-slate-500 mt-1">Live tracking of all pipeline movements and operator actions.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl transition-all">
              <ArrowLeft className="w-4 h-4" /> CRM
            </Link>
            <Link href="/admin" className="flex items-center gap-2 text-sm font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-xl transition-all">
              <LayoutDashboard className="w-4 h-4" /> Command Center
            </Link>
          </div>
        </div>

        {/* Tactical UI Toggle */}
        <div className="flex bg-slate-200/50 p-1.5 rounded-2xl mb-6 w-fit mx-auto sm:mx-0">
          <button 
            onClick={() => setViewMode("timeline")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${viewMode === "timeline" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            <List className="w-4 h-4" /> Live Feed
          </button>
          <button 
            onClick={() => setViewMode("velocity")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${viewMode === "velocity" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            <BarChart3 className="w-4 h-4" /> Velocity Metrics
          </button>
        </div>

        {/* Data Container */}
        <div className="bg-white rounded-[24px] shadow-sm border border-slate-200 p-6 sm:p-8 relative">
          
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-600" />
              <p className="text-sm font-medium">Decrypting logs...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-50 text-rose-700 rounded-xl border border-rose-200 text-sm font-semibold text-center">
              Failed to load logs: {error}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-20">
              <Clock className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500 font-medium">No activity logged yet.</p>
            </div>
          ) : viewMode === "timeline" ? (
            // --- RAW TIMELINE VIEW ---
            <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
              {logs.map((log) => (
                <div key={log.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  
                  {/* Timeline Node */}
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-blue-100 text-blue-600 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                    <Activity className="w-4 h-4" />
                  </div>
                  
                  {/* Log Card */}
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-2xl bg-white border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] group-hover:border-blue-200 group-hover:shadow-md transition-all">
                    
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {formatDate(log.created_at)}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900 mb-1">
                      {log.websites?.website_name || `Website #${log.website_id}`}
                    </h3>

                    <div className="flex items-center gap-2 text-sm font-medium text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 my-3">
                      <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md text-xs">{log.old_value || "None"}</span>
                      <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md text-xs">{log.new_value}</span>
                    </div>

                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100 text-xs font-semibold text-slate-500">
                      <UserIcon className="w-3.5 h-3.5" />
                      {log.changed_by_email}
                    </div>
                    
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // --- VELOCITY METRICS VIEW ---
            <div className="space-y-8">
              {groupedVelocity.map((site, index) => (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm" key={index}>
                  <div className="bg-slate-950 px-5 py-3">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-blue-400" />
                      {site.website_name}
                    </h3>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="px-5 py-3 font-semibold uppercase tracking-wider text-xs">Status Flow</th>
                          <th className="px-5 py-3 font-semibold uppercase tracking-wider text-xs">Time Taken (Biz Hrs)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {site.transitions.map((t: any) => (
                          <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-3 font-medium text-slate-700 flex items-center gap-2">
                              {t.flow.split('->').map((part: string, i: number, arr: string[]) => (
                                <span key={i} className="flex items-center gap-2">
                                  <span className={i === 0 ? "text-slate-400" : "text-slate-800"}>{part.trim()}</span>
                                  {i < arr.length - 1 && <ArrowRight className="w-3 h-3 text-slate-300" />}
                                </span>
                              ))}
                            </td>
                            <td className="px-5 py-3 text-slate-600">
                              <span className="inline-flex font-mono text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1 rounded-md">
                                {t.timeTaken}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}