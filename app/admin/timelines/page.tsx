"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Activity, Clock, ArrowRight, User as UserIcon, LayoutDashboard, Loader2, ArrowLeft } from "lucide-react";
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
  } | null;
};

export default function TimelinesPage() {
  const { role, loading: authLoading } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLogs() {
      // Fetch the last 100 activity logs, joining the website name
      const { data, error } = await supabase
        .from("website_activity_logs")
        .select(`
          *,
          websites (
            website_name
          )
        `)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        setError(error.message);
      } else {
        setLogs(data as ActivityLog[]);
      }
      setLoading(false);
    }

    fetchLogs();
  }, []);

  // Format date natively without extra libraries
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
            <Link href="/" className="flex items-center gap-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl transition-all">
              <ArrowLeft className="w-4 h-4" /> CRM
            </Link>
            <Link href="/admin" className="flex items-center gap-2 text-sm font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-xl transition-all">
              <LayoutDashboard className="w-4 h-4" /> Command Center
            </Link>
          </div>
        </div>

        {/* Timeline Feed */}
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
          ) : (
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
          )}
        </div>
      </div>
    </main>
  );
}
