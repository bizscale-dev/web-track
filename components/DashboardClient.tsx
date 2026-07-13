"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { Search, Sparkles, Lock, Settings, User as UserIcon, X, FileText } from "lucide-react";
import DashboardStats from "./DashboardStats";
import WebsiteCard from "./WebsiteCard";
import UserProfileSettings from "./UserProfileSettings";
import { supabase } from "@/lib/supabase";
import type { Website } from "@/type/website";
import { triggerN8nWebhook } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

type DashboardClientProps = {
  initialData: Website[];
  loadError?: string | null;
};

export default function DashboardClient({
  initialData,
  loadError,
}: DashboardClientProps) {
  const router = useRouter();
  
  // EXTRACTING THE IDENTITY: Now pulls role, name, AND avatar
  const { role, name, avatar } = useAuth(); 
  const [showSettings, setShowSettings] = useState(false);

  const [websites, setWebsites] = useState<Website[]>(initialData || []);

  useEffect(() => {
    setWebsites(initialData || []);
  }, [initialData]);
  
  const [updatingWebsiteIds, setUpdatingWebsiteIds] = useState<number[]>([]);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [activityLogError, setActivityLogError] = useState<string | null>(null);
  const [deletingWebsiteIds, setDeletingWebsiteIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [viewFilter, setViewFilter] = useState<"All" | "Not Started" | "In Progress" | "Completed">("In Progress");

  // --- INTERCEPTOR MODAL STATE ---
  const [demandModal, setDemandModal] = useState({
    isOpen: false,
    websiteId: 0,
    nextStatus: "",
    notes: "",
    websiteName: ""
  });

  const filteredWebsites = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return websites.filter((website) => {
      let matchesStatus = true;
      if (viewFilter === "Not Started") {
        matchesStatus = website.status === "Pending";
      } else if (viewFilter === "In Progress") {
        matchesStatus = [
          "In Progress",
          "Pages Development",
          "Sent For Content Demand",
          "Sent For Content",
          "Content Completed",
          "Content Updated",
          "Domain Connection",
        ].includes(website.status || "");
      } else if (viewFilter === "Completed") {
        matchesStatus = ["Completed", "Initial SEO"].includes(website.status || "");
      }

      const matchesSearch =
        normalizedSearch.length === 0 ||
        [
          website.website_name,
          website.domain,
          website.developer,
          website.content_writer,
          website.seo_person,
          website.priority,
        ]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(normalizedSearch));

      return matchesStatus && matchesSearch;
    });
  }, [search, viewFilter, websites]);

  // --- 1. THE INTERCEPTOR ---
  async function handleStatusChange(websiteId: number, nextStatus: string) {
    const currentWebsite = websites.find((website) => website.id === websiteId);
    if (!currentWebsite || currentWebsite.status === nextStatus) return;

    // Intercept if it's Content Demand
    if (nextStatus === "Sent For Content Demand") {
      // Fetch the raw notes from the database
      const { data } = await supabase.from("websites").select("notes").eq("id", websiteId).single();
      
      setDemandModal({
        isOpen: true,
        websiteId: websiteId,
        nextStatus: nextStatus,
        notes: data?.notes || "",
        websiteName: currentWebsite.website_name
      });
      return; // Pause execution here
    }

    // Otherwise, push straight through
    executeStatusChange(websiteId, nextStatus);
  }

  // --- 2. THE EXECUTOR ---
  async function executeStatusChange(websiteId: number, nextStatus: string, customNotes?: string) {
    const currentWebsite = websites.find((website) => website.id === websiteId);
    if (!currentWebsite) return;

    const previousStatus = currentWebsite.status;
    setStatusError(null);
    setActivityLogError(null);
    setUpdatingWebsiteIds((ids) => [...ids, websiteId]);
    
    setWebsites((currentWebsites) =>
      currentWebsites.map((website) =>
        website.id === websiteId ? { ...website, status: nextStatus } : website
      )
    );

    const { error } = await supabase.from("websites").update({ status: nextStatus }).eq("id", websiteId);
    setUpdatingWebsiteIds((ids) => ids.filter((id) => id !== websiteId));

    if (!error) {
      const operatorIdentity = name || "Unknown Operator";

      // Log to Forensics Timeline
      const { error: logError } = await supabase
        .from("website_activity_logs")
        .insert({
          website_id: websiteId,
          event_type: "status_changed",
          old_value: previousStatus,
          new_value: nextStatus,
          message: `Status changed from ${previousStatus} to ${nextStatus}`,
          changed_by_email: operatorIdentity,
        });

      if (logError) setActivityLogError(logError.message);

      // Send to n8n Webhook, injecting customNotes if they exist
      triggerN8nWebhook({
        event: 'status_changed',
        websiteName: currentWebsite.website_name,
        domain: currentWebsite.domain,
        oldStatus: previousStatus,
        newStatus: nextStatus,
        websiteId: websiteId,
        changedBy: operatorIdentity,
        customNotes: customNotes // <-- Injected here
      }).catch(err => console.error("Server action failed:", err));

      router.refresh();
      return;
    }

    // Rollback on error
    setWebsites((currentWebsites) =>
      currentWebsites.map((website) =>
        website.id === websiteId ? { ...website, status: previousStatus } : website
      )
    );
    setStatusError(error.message);
  }

  async function handleDeleteWebsite(websiteId: number) {
    const targetWebsite = websites.find((website) => website.id === websiteId);
    if (!targetWebsite) return;

    const shouldDelete = window.confirm(`Delete "${targetWebsite.website_name}"?`);
    if (!shouldDelete) return;

    setStatusError(null);
    setActivityLogError(null);
    setDeletingWebsiteIds((ids) => [...ids, websiteId]);
    setWebsites((currentWebsites) => currentWebsites.filter((website) => website.id !== websiteId));

    const { error } = await supabase.from("websites").delete().eq("id", websiteId);
    setDeletingWebsiteIds((ids) => ids.filter((id) => id !== websiteId));

    if (error) {
      setWebsites((currentWebsites) => {
        const alreadyExists = currentWebsites.some((website) => website.id === websiteId);
        if (alreadyExists) return currentWebsites;
        return [targetWebsite, ...currentWebsites];
      });
      setStatusError(error.message);
    } else {
      router.refresh();
    }
  }

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 relative">
      <header className="mb-8 overflow-hidden rounded-[28px] border border-white/60 bg-white/70 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              <Sparkles className="h-3.5 w-3.5" />
              Website operations
            </div>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
              Website CRM
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              Track owners, status flow, pages, credentials, and delivery notes
              from one calm workspace.
            </p>
          </div>

          <div className="flex flex-col gap-4 lg:items-end">
            
            {role !== "user" && (
              <div className="flex items-center gap-3 w-full sm:w-auto justify-end px-2">
                <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-full pl-1.5 pr-4 py-1.5 shadow-sm">
                  <button 
                    onClick={() => setShowSettings(true)}
                    className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center hover:opacity-80 transition shrink-0 overflow-hidden"
                    title="Edit Profile"
                  >
                    {avatar ? (
                      <img src={avatar} alt={name} className="w-full h-full object-cover" />
                    ) : (
                      name ? name.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />
                    )}
                  </button>
                  
                  <div className="flex flex-col justify-center min-w-[80px]">
                    <span className="text-xs font-bold text-slate-900 leading-none truncate max-w-[120px]">
                      {name || "User"}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 leading-tight mt-0.5">
                      {role}
                    </span>
                  </div>

                  <div className="w-px h-6 bg-slate-200 mx-1"></div>

                  <button 
                    onClick={() => setShowSettings(true)}
                    className="text-slate-400 hover:text-blue-600 p-1"
                    title="Settings"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            <div className="flex w-full sm:w-auto gap-3">
              {role === "admin" || role === "manager" ? (
                <Link href="/websites/new" className="inline-flex h-11 w-full sm:w-auto items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(37,99,235,0.18)] transition hover:-translate-y-0.5 hover:bg-blue-700">
                  + Add Website
                </Link>
              ) : (
                <div className="inline-flex h-11 w-full sm:w-auto items-center justify-center gap-2 rounded-2xl bg-slate-100 border border-slate-200 px-6 text-sm font-semibold text-slate-400 cursor-not-allowed opacity-80" title="Manager clearance required">
                  <Lock className="w-4 h-4" /> Add Website
                </div>
              )}
            </div>

            <div className="w-full lg:w-[320px]">
              <label className="relative block">
                <span className="sr-only">Search websites</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white/90 pl-9 pr-3 text-sm shadow-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                  placeholder="Search websites..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
            </div>
          </div>
        </div>
      </header>

      {loadError ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-700 shadow-sm">
          {loadError}
        </div>
      ) : null}

      {statusError ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-700 shadow-sm">
          Status update failed: {statusError}
        </div>
      ) : null}

      {activityLogError ? (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-800 shadow-sm">
          Status updated, but activity logging failed: {activityLogError}
        </div>
      ) : null}

      <DashboardStats websites={websites} />

      <div className="mt-8 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5">
          <div className="inline-flex rounded-2xl bg-slate-100/80 p-1 backdrop-blur-sm border border-slate-200/40 shadow-inner overflow-x-auto max-w-full">
            {(["All", "In Progress", "Completed", "Not Started"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setViewFilter(filter)}
                className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all duration-300 cursor-pointer whitespace-nowrap ${
                  viewFilter === filter
                    ? "bg-white text-slate-950 shadow-[0_4px_20px_rgba(0,0,0,0.08)]"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/40"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          <p className="text-sm text-slate-500 whitespace-nowrap ml-4">
            Showing <span className="font-semibold text-slate-900">{filteredWebsites.length}</span>{" "}
            of <span className="font-semibold text-slate-900">{websites.length}</span> websites
          </p>
        </div>

        {filteredWebsites.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-slate-200 bg-white/80 p-10 text-center text-slate-500 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur">
            No websites match your current filters.
          </div>
        ) : (
          filteredWebsites.map((w) => (
            <WebsiteCard
              key={w.id}
              website={w}
              isUpdating={updatingWebsiteIds.includes(w.id)}
              onStatusChange={handleStatusChange}
              onDeleteWebsite={handleDeleteWebsite}
              isDeleting={deletingWebsiteIds.includes(w.id)}
            />
          ))
        )}
      </div>

      {showSettings && <UserProfileSettings onClose={() => setShowSettings(false)} />}

      {/* --- THE INTERCEPTOR MODAL --- */}
      {demandModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-2xl overflow-hidden relative border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <h3 className="font-black text-lg text-slate-900">Content Demand: {demandModal.websiteName}</h3>
              </div>
              <button 
                onClick={() => setDemandModal({ ...demandModal, isOpen: false })} 
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4 bg-blue-50 border border-blue-100 p-3 rounded-xl">
                Edit the text below to specify what pages/content Ammar needs. <br/>
                <span className="font-bold text-blue-800">Note: This will NOT overwrite your original notes in the database.</span>
              </p>
              
              <textarea 
                className="w-full h-64 p-4 text-sm text-slate-700 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-none shadow-inner"
                value={demandModal.notes}
                onChange={(e) => setDemandModal({ ...demandModal, notes: e.target.value })}
                placeholder="List the target pages here..."
              />
              
              <div className="flex justify-end gap-3 mt-6">
                <button 
                  onClick={() => setDemandModal({ ...demandModal, isOpen: false })} 
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    executeStatusChange(demandModal.websiteId, demandModal.nextStatus, demandModal.notes);
                    setDemandModal({ ...demandModal, isOpen: false });
                  }} 
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-all"
                >
                  Confirm & Notify Ammar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}