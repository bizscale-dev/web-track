"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, Server } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function TimelinesPage() {
  const [sites, setSites] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [{ data: websites }, { data: activityLogs }] = await Promise.all([
      supabase.from("websites").select("*").order("created_at", { ascending: false }),
      supabase.from("website_activity_logs").select("*").order("created_at", { ascending: true })
    ]);

    if (websites) setSites(websites);
    if (activityLogs) setLogs(activityLogs);
    setLoading(false);
  };

  const formatTime = (ms: number) => {
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  };

  const calculateSiteStages = (site: any) => {
    const siteLogs = logs.filter(l => l.website_id === site.id);
    if (siteLogs.length === 0) return [];

    const stages = [];
    let previousTime = new Date(site.created_at).getTime();
    let previousStage = "Pending (Creation)";

    siteLogs.forEach(log => {
      const currentTime = new Date(log.created_at).getTime();
      const diff = currentTime - previousTime;
      stages.push({
        from: previousStage,
        to: log.new_value,
        duration: formatTime(diff)
      });
      previousTime = currentTime;
      previousStage = log.new_value;
    });

    // Time spent in the current (ongoing) stage
    const now = new Date().getTime();
    const ongoingDiff = now - previousTime;
    stages.push({
      from: previousStage,
      to: "Current Stage",
      duration: formatTime(ongoingDiff),
      isCurrent: true
    });

    return stages;
  };

  if (loading) {
    return (
      <main className="p-8 max-w-7xl mx-auto w-full text-center mt-20">
        <div className="animate-pulse text-gray-500 font-medium">Decrypting timelines...</div>
      </main>
    );
  }

  return (
    <main className="p-8 max-w-7xl mx-auto w-full">
      <div className="mb-8">
        <Link href="/admin" className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Command Center
        </Link>
        <h1 className="text-3xl font-black tracking-tight text-gray-900 flex items-center gap-3">
          <Server className="w-8 h-8 text-blue-600" /> Site Forensics
        </h1>
        <p className="mt-2 text-gray-600">Detailed temporal breakdown of every operational stage per website.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {sites.map(site => {
          const stages = calculateSiteStages(site);
          return (
            <div key={site.id} className="bg-white/60 backdrop-blur-md border border-gray-200/60 p-6 rounded-2xl shadow-sm flex flex-col">
              <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-100">
                <h2 className="text-xl font-bold text-gray-900 truncate pr-4">{site.website_name}</h2>
                <span className="text-xs font-semibold px-3 py-1 bg-gray-100 text-gray-600 rounded-full shrink-0">
                  {site.status}
                </span>
              </div>
              
              {stages.length === 0 ? (
                <p className="text-sm text-gray-500 italic py-4">No status changes recorded for this site yet.</p>
              ) : (
                <div className="space-y-3 flex-grow">
                  {stages.map((stage, i) => (
                    <div key={i} className={`flex justify-between items-center p-3 rounded-xl border ${
                      stage.isCurrent 
                        ? 'bg-blue-50/50 border-blue-100 shadow-sm' 
                        : 'bg-gray-50/50 border-gray-100'
                    }`}>
                      <div className="text-sm">
                        <span className="text-gray-500 font-medium">{stage.from}</span>
                        <span className="mx-2 text-gray-300">→</span>
                        <span className="text-gray-800 font-semibold">{stage.to}</span>
                      </div>
                      <div className={`text-sm font-bold shrink-0 ml-4 flex items-center gap-1.5 ${
                        stage.isCurrent ? 'text-blue-600' : 'text-gray-600'
                      }`}>
                        <Clock className="w-3.5 h-3.5 opacity-70" />
                        {stage.duration}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
