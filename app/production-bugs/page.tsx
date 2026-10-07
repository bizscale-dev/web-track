"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import type { ProductionBug, ProductionBugCause } from "@/type/productionBug";
import {
  Loader2,
  ShieldAlert,
  Bug,
  ArrowLeft,
  Plus,
  Globe,
  CheckCircle2,
  RotateCcw,
  Trash2,
  AlertTriangle,
  UserX,
  Wrench,
  ImageIcon,
  X,
} from "lucide-react";

type TeamMember = { name: string; email: string; role: string };
type StatusFilter = "all" | "open" | "fixed";

function daysAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function normalizeSiteLink(link: string): string {
  const trimmed = link.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export default function ProductionBugsPage() {
  const { role, name, email, loading: authLoading } = useAuth();
  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const canManage = isAdmin || isManager;
  // Everyone signed in can open this page — admin/manager/HR see every bug,
  // anyone else only sees bugs reported against them (so a developer can
  // actually clear the notification they were just pinged about).
  const canViewAll = canManage || role === "hr";
  const canView = role !== "user" && !!role;

  const [bugs, setBugs] = useState<ProductionBug[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteLink, setSiteLink] = useState("");
  const [developerEmail, setDeveloperEmail] = useState("");
  const [causeType, setCauseType] = useState<ProductionBugCause>("technical_issue");
  const [causedByEmail, setCausedByEmail] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreviewUrl, setScreenshotPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [updatingId, setUpdatingId] = useState<number | null>(null);

  async function loadBugs() {
    setIsLoading(true);
    const { data } = await supabase
      .from("production_bugs")
      .select("*")
      .order("created_at", { ascending: false });
    setBugs((data as ProductionBug[]) || []);
    setIsLoading(false);
  }

  async function loadTeamMembers() {
    const { data } = await supabase
      .from("team_members")
      .select("name, email, role")
      .neq("role", "admin")
      .order("name", { ascending: true });
    setTeamMembers((data as TeamMember[]) || []);
  }

  // Visiting this page means the developer has now seen whatever's reported
  // against them — clears their notification dot. Harmless no-op for
  // admin/manager/hr since bugs aren't usually self-assigned.
  async function markBugsSeen() {
    if (!email) return;
    await supabase
      .from("production_bugs")
      .update({ developer_seen: true })
      .eq("developer_email", email)
      .eq("developer_seen", false);
  }

  useEffect(() => {
    if (canView) {
      loadBugs();
      markBugsSeen();
      if (canManage) loadTeamMembers();
    }
  }, [canView, canManage, email]);

  // Non-managers only ever see bugs reported against them.
  const visibleBugs = useMemo(
    () => (canViewAll ? bugs : bugs.filter((b) => b.developer_email === email)),
    [bugs, canViewAll, email]
  );

  const useScreenshotFile = (file: File) => {
    setScreenshotFile(file);
    setScreenshotPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  };

  // Lets the reporter paste a screenshot straight from the clipboard (e.g.
  // after a Snipping Tool capture) instead of only having a file picker.
  const handlePaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    useScreenshotFile(file);
  };

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) useScreenshotFile(file);
    e.target.value = ""; // lets picking the same file again re-fire onChange
  };

  const removeScreenshot = () => {
    setScreenshotFile(null);
    setScreenshotPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  };

  const submitBug = async () => {
    const developer = teamMembers.find((m) => m.email === developerEmail);
    const causedBy = teamMembers.find((m) => m.email === causedByEmail);
    if (!title.trim() || !developer) return;
    if (causeType === "human_error" && !causedBy) return;

    setIsSaving(true);
    setSaveError(null);

    let screenshotUrl: string | null = null;
    if (screenshotFile) {
      const fileExt = screenshotFile.type.split("/")[1] || "png";
      const filePath = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("bug-screenshots")
        .upload(filePath, screenshotFile);

      if (uploadError) {
        setIsSaving(false);
        setSaveError("Couldn't upload screenshot: " + uploadError.message);
        return;
      }

      screenshotUrl = supabase.storage.from("bug-screenshots").getPublicUrl(filePath).data.publicUrl;
    }

    const { error } = await supabase.from("production_bugs").insert({
      title: title.trim(),
      description: description.trim() || null,
      site_name: siteName.trim() || null,
      site_domain: siteLink.trim() ? normalizeSiteLink(siteLink) : null,
      developer_name: developer.name,
      developer_email: developer.email,
      reported_by_name: name || "Unknown Operator",
      reported_by_email: email || "",
      status: "open",
      developer_seen: false,
      cause_type: causeType,
      caused_by_name: causeType === "human_error" ? causedBy!.name : null,
      caused_by_email: causeType === "human_error" ? causedBy!.email : null,
      screenshot_url: screenshotUrl,
    });

    setIsSaving(false);

    if (error) {
      setSaveError(error.message);
      return;
    }

    setTitle("");
    setDescription("");
    setSiteName("");
    setSiteLink("");
    setDeveloperEmail("");
    setCauseType("technical_issue");
    setCausedByEmail("");
    removeScreenshot();
    setShowForm(false);
    await loadBugs();
  };

  const toggleStatus = async (bug: ProductionBug) => {
    setUpdatingId(bug.id);
    const nextStatus = bug.status === "fixed" ? "open" : "fixed";
    await supabase
      .from("production_bugs")
      .update({
        status: nextStatus,
        fixed_at: nextStatus === "fixed" ? new Date().toISOString() : null,
      })
      .eq("id", bug.id);
    setUpdatingId(null);
    await loadBugs();
  };

  const deleteBug = async (bugId: number) => {
    if (!window.confirm("Delete this bug report? This can't be undone.")) return;
    const { error } = await supabase.from("production_bugs").delete().eq("id", bugId);
    if (!error) setBugs((current) => current.filter((b) => b.id !== bugId));
  };

  const filteredBugs = useMemo(() => {
    if (statusFilter === "all") return visibleBugs;
    return visibleBugs.filter((b) => b.status === statusFilter);
  }, [visibleBugs, statusFilter]);

  const openCount = visibleBugs.filter((b) => b.status === "open").length;

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
        <p className="text-gray-600">Please sign in to view Production Bugs.</p>
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
          <div className="p-3 bg-rose-600 text-white rounded-xl shadow-sm">
            <Bug className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-[var(--bg-foreground)]">Production Bugs</h1>
            <p className="text-[var(--bg-muted)] text-sm mt-1">
              {openCount} open bug{openCount === 1 ? "" : "s"}
              {!canViewAll && " assigned to you"}
            </p>
          </div>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 h-11 px-5 rounded-2xl bg-[var(--button)] text-[var(--button-text)] text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--button-hover)] shrink-0"
          >
            <Plus className="w-4 h-4" /> Report Bug
          </button>
        )}
      </div>

      {canManage && showForm && (
        <div
          className="bg-[var(--card)] border border-rose-200 rounded-2xl shadow-sm p-5 mb-6 space-y-3"
          onPaste={handlePaste}
        >
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--card-muted)]">New Bug Report</p>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's broken?"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Details (optional)"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 resize-none"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="Site / project (optional)"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
            />
            <input
              type="text"
              value={siteLink}
              onChange={(e) => setSiteLink(e.target.value)}
              placeholder="Link (optional)"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
            />
          </div>
          <select
            value={developerEmail}
            onChange={(e) => setDeveloperEmail(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 bg-white"
          >
            <option value="">Assign to...</option>
            {teamMembers.map((m) => (
              <option key={m.email} value={m.email}>
                {m.name} ({m.role})
              </option>
            ))}
          </select>

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--card-muted)] mb-1.5">What caused this?</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCauseType("human_error")}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                  causeType === "human_error"
                    ? "border-rose-300 bg-rose-50 text-rose-700"
                    : "border-gray-200 text-[var(--card-muted)] hover:border-rose-200"
                }`}
              >
                <UserX className="w-4 h-4" /> Left Out by Someone
              </button>
              <button
                type="button"
                onClick={() => setCauseType("technical_issue")}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                  causeType === "technical_issue"
                    ? "border-rose-300 bg-rose-50 text-rose-700"
                    : "border-gray-200 text-[var(--card-muted)] hover:border-rose-200"
                }`}
              >
                <Wrench className="w-4 h-4" /> Technical Issue
              </button>
            </div>
          </div>

          {causeType === "human_error" && (
            <select
              value={causedByEmail}
              onChange={(e) => setCausedByEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 bg-white"
            >
              <option value="">Caused by...</option>
              {teamMembers.map((m) => (
                <option key={m.email} value={m.email}>
                  {m.name} ({m.role})
                </option>
              ))}
            </select>
          )}

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--card-muted)] mb-1.5">Screenshot (optional)</p>
            {screenshotPreviewUrl ? (
              <div className="relative inline-block">
                <img
                  src={screenshotPreviewUrl}
                  alt="Pasted screenshot"
                  className="max-h-40 rounded-lg border border-gray-200"
                />
                <button
                  type="button"
                  onClick={removeScreenshot}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gray-900 text-white flex items-center justify-center shadow-sm hover:bg-rose-600"
                  title="Remove screenshot"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div
                tabIndex={0}
                onPaste={handlePaste}
                className="flex items-center justify-center gap-2 px-3 py-4 rounded-lg border border-dashed border-gray-300 text-sm text-[var(--card-muted)] focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400"
              >
                <ImageIcon className="w-4 h-4" /> Press Ctrl+V anywhere in this form to paste a screenshot
                <span className="text-gray-300">or</span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center w-6 h-6 rounded-full border border-gray-300 text-[var(--card-muted)] hover:border-rose-300 hover:text-rose-600 transition-colors shrink-0"
                  title="Choose a file instead"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFilePicked}
                  className="hidden"
                />
              </div>
            )}
          </div>

          {saveError && <p className="text-xs font-bold text-rose-600">{saveError}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={submitBug}
              disabled={isSaving || !title.trim() || !developerEmail || (causeType === "human_error" && !causedByEmail)}
              className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-bold hover:bg-rose-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Report Bug
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                removeScreenshot();
              }}
              disabled={isSaving}
              className="px-4 py-2 text-[var(--card-muted)] rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="inline-flex rounded-2xl bg-slate-100/95 p-1 border border-slate-200/40 shadow-inner mb-6">
        {(["open", "fixed", "all"] as StatusFilter[]).map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setStatusFilter(filter)}
            className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl capitalize transition-all ${
              statusFilter === filter
                ? "bg-[var(--card)] text-[var(--card-foreground)] shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
        </div>
      ) : filteredBugs.length === 0 ? (
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-sm p-10 text-center">
          <p className="text-[var(--card-muted)]">No bugs here.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredBugs.map((bug) => {
            const isFixed = bug.status === "fixed";
            const isUpdatingThis = updatingId === bug.id;
            // The assigned developer can mark their own bug fixed, not just
            // whoever reported it.
            const canToggleThis = canManage || bug.developer_email === email;

            return (
              <div
                key={bug.id}
                className={`rounded-2xl border shadow-sm p-4 transition-all ${
                  isFixed ? "bg-emerald-50/50 border-emerald-200" : "bg-rose-50/40 border-rose-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5 flex-wrap">
                      {!isFixed && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-100 text-rose-600 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Open
                        </span>
                      )}
                      {bug.cause_type === "human_error" ? (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 flex items-center gap-1">
                          <UserX className="w-3 h-3" /> Left Out by {bug.caused_by_name}
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 flex items-center gap-1">
                          <Wrench className="w-3 h-3" /> Technical Issue
                        </span>
                      )}
                      {bug.title}
                    </p>
                    {bug.description && (
                      <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{bug.description}</p>
                    )}
                    {bug.screenshot_url && (
                      <a href={bug.screenshot_url} target="_blank" rel="noreferrer" className="inline-block mt-2">
                        <img
                          src={bug.screenshot_url}
                          alt="Bug screenshot"
                          className="max-h-32 rounded-lg border border-gray-200 hover:opacity-90 transition-opacity"
                        />
                      </a>
                    )}
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-gray-400">
                      {bug.site_name && (
                        bug.site_domain ? (
                          <a
                            href={bug.site_domain}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 hover:text-[var(--accent)]"
                          >
                            <Globe className="w-3 h-3" /> {bug.site_name}
                          </a>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Globe className="w-3 h-3" /> {bug.site_name}
                          </span>
                        )
                      )}
                      <span>assigned to {bug.developer_name}</span>
                      <span>reported by {bug.reported_by_name}</span>
                      <span>{daysAgo(bug.created_at)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full flex items-center gap-1 ${
                        isFixed
                          ? "text-emerald-600 bg-emerald-50 border border-emerald-100"
                          : "text-rose-600 bg-rose-50 border border-rose-100"
                      }`}
                    >
                      {isFixed ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                      {isFixed ? "Fixed" : "Open"}
                    </span>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => deleteBug(bug.id)}
                        className="text-gray-300 hover:text-rose-500"
                        title="Delete bug report"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {canToggleThis && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => toggleStatus(bug)}
                      disabled={isUpdatingThis}
                      className={`text-sm font-bold flex items-center gap-1.5 disabled:opacity-50 ${
                        isFixed ? "text-amber-600 hover:text-amber-800" : "text-emerald-700 hover:text-emerald-800"
                      }`}
                    >
                      {isUpdatingThis ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isFixed ? (
                        <RotateCcw className="w-4 h-4" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      {isFixed ? "Reopen" : "Mark Fixed"}
                    </button>
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
