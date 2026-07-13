"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Layers3, Trash2, Clock, Lock } from "lucide-react";
import { WEBSITE_STATUSES } from "@/lib/statuses";
import type { Website } from "@/type/website";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";

type WebsiteCardProps = {
  website: Website;
  isUpdating: boolean;
  onStatusChange: (websiteId: number, nextStatus: string) => void;
  onDeleteWebsite: (websiteId: number) => void;
  isDeleting: boolean;
};

export default function WebsiteCard({
  website,
  isUpdating,
  onStatusChange,
  onDeleteWebsite,
  isDeleting,
}: WebsiteCardProps) {
  const { role } = useAuth();
  // SPLIT CLEARANCE LOGIC:
  // Staff can change status. Only Admin/Manager can delete.
  const canManageStatus = role && role !== "user";
  const canDelete = role === "admin" || role === "manager";
  const pageCount = Array.isArray(website.pages) ? website.pages.length : 0;
  const [timeInStage, setTimeInStage] = useState<string>("...");

  // Strict Pipeline Logic
  const currentStatusIndex = WEBSITE_STATUSES.indexOf(website.status || "Pending");
  const allowedStatuses = currentStatusIndex !== -1 
    ? WEBSITE_STATUSES.filter((_, index) => Math.abs(index - currentStatusIndex) <= 1)
    : WEBSITE_STATUSES;

  useEffect(() => {
    const fetchTimeInStage = async () => {
      const { data, error } = await supabase
        .from("website_activity_logs")
        .select("created_at")
        .eq("website_id", website.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const startTime = data && data.length > 0 ? data[0].created_at : website.created_at;
      
      if (!startTime) {
        setTimeInStage("N/A");
        return;
      }

      const start = new Date(startTime);
      const end = new Date();

      if (start >= end) {
        setTimeInStage("0h");
        return;
      }

      // --- NEW BUSINESS TIME ALGORITHM ---
      let businessMs = 0;
      let current = new Date(start);

      while (current < end) {
        // Look ahead to the next hour boundary, or the end time
        const nextHour = new Date(current);
        nextHour.setHours(current.getHours() + 1, 0, 0, 0);
        const stepEnd = nextHour < end ? nextHour : end;

        const day = current.getDay();
        
        // Exclude Saturday (6) and Sunday (0)
        if (day !== 0 && day !== 6) {
          businessMs += stepEnd.getTime() - current.getTime();
        }

        current = stepEnd;
      }

      const days = Math.floor(businessMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((businessMs / (1000 * 60 * 60)) % 24);
      // -----------------------------------
      
      if (days > 0) {
        setTimeInStage(`${days}d ${hours}h`);
      } else {
        setTimeInStage(`${hours}h`);
      }
    };

    fetchTimeInStage();
  }, [website.status, website.id, website.created_at]);

  return (
    <article className="rounded-[24px] border border-white/70 bg-white/85 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight text-slate-950">
              {website.website_name}
            </h2>

            {website.priority ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {website.priority}
              </span>
            ) : null}

            {pageCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                <Layers3 className="h-3.5 w-3.5" />
                {pageCount} pages
              </span>
            ) : null}

            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 shadow-sm" title="Business time spent in current stage">
              <Clock className="h-3.5 w-3.5" />
              {timeInStage}
            </span>
          </div>

          <p className="mt-2 truncate text-sm text-slate-500">
            {website.domain}
          </p>

          <div className="mt-5 grid gap-4 text-sm text-slate-600 sm:grid-cols-3">
            <Meta label="Developer" value={website.developer} />
            <Meta label="Content" value={website.content_writer} />
            <Meta label="SEO" value={website.seo_person} />
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-end">
          
          {/* SECURITY PATCH: Status Dropdown (Staff Clearance) */}
          {canManageStatus ? (
            <select
              className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 cursor-pointer"
              value={website.status || ""}
              disabled={isUpdating}
              onChange={(e) => onStatusChange(website.id, e.target.value)}
            >
              {allowedStatuses.map((status) => (
                <option key={status} value={status}>
                  {status} {status === website.status ? "(Current)" : ""}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-500 cursor-not-allowed select-none">
              {website.status}
              <Lock className="h-4 w-4 text-slate-400" />
            </div>
          )}

          <div className="flex items-center gap-3">
            {isUpdating ? (
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Saving...
              </span>
            ) : null}

            {/* SECURITY PATCH: Delete Button (Command Clearance Only) */}
            <button
              type="button"
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isDeleting || !canDelete}
              onClick={() => onDeleteWebsite(website.id)}
              title={!canDelete ? "Requires Manager/Admin clearance to delete" : "Delete Website"}
            >
              {!canDelete ? <Lock className="h-4 w-4 text-rose-400" /> : <Trash2 className="h-4 w-4" />}
              {isDeleting ? "Deleting..." : "Delete"}
            </button>

            <Link
              href={`/websites/${website.id}`}
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:bg-slate-800"
            >
              Details
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function Meta({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 truncate font-medium text-slate-700">
        {value || "Unassigned"}
      </p>
    </div>
  );
}