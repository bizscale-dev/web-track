"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { getEodSiteOptions, getSitePages } from "@/app/eodActions";
import type { EodEntry, EodReport, EodSiteOption, EodSitePage } from "@/type/eod";
import {
  Loader2,
  ShieldAlert,
  ClipboardList,
  Search,
  Globe,
  Plus,
  Trash2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  X,
  Pencil,
  PlusCircle,
} from "lucide-react";

function normalizeSiteLink(link: string): string {
  const trimmed = link.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

type DraftPage = {
  key: string;
  label: string;
  url: string | null;
  isNewPage: boolean;
  notes: string;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function EodPage() {
  const { role, email, name: authName, loading: authLoading } = useAuth();

  const [resolvedName, setResolvedName] = useState<string>("");
  const [memberEmail, setMemberEmail] = useState<string>("");
  const [report, setReport] = useState<EodReport | null>(null);
  const [entries, setEntries] = useState<EodEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [siteOptions, setSiteOptions] = useState<EodSiteOption[]>([]);
  const [siteOptionsError, setSiteOptionsError] = useState<string | null>(null);
  const [isLoadingSites, setIsLoadingSites] = useState(false);
  const [siteSearch, setSiteSearch] = useState("");
  const [selectedSite, setSelectedSite] = useState<EodSiteOption | null>(null);

  const [isAddingManualSite, setIsAddingManualSite] = useState(false);
  const [manualSiteName, setManualSiteName] = useState("");
  const [manualSiteLink, setManualSiteLink] = useState("");

  const [sitePages, setSitePages] = useState<EodSitePage[]>([]);
  const [sitePagesError, setSitePagesError] = useState<string | null>(null);
  const [isLoadingPages, setIsLoadingPages] = useState(false);

  const [draftPages, setDraftPages] = useState<DraftPage[]>([]);
  const [newPageName, setNewPageName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const canSubmit = role === "developer" || role === "manager";

  useEffect(() => {
    if (canSubmit) initReport();
  }, [canSubmit]);

  const initReport = async () => {
    setIsLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    let memberName = authName || "Unknown Operator";
    let memberEmail = email || user?.email || "";

    if (user?.email) {
      const { data: teamMember } = await supabase
        .from("team_members")
        .select("name, role")
        .eq("email", user.email)
        .single();
      if (teamMember?.name) memberName = teamMember.name;
    }

    setResolvedName(memberName);
    setMemberEmail(memberEmail);

    const today = todayIso();
    const { data: existingReport } = await supabase
      .from("eod_reports")
      .select("*")
      .eq("team_member_email", memberEmail)
      .eq("report_date", today)
      .maybeSingle();

    const activeReport = existingReport as EodReport | null;
    setReport(activeReport);

    if (activeReport) {
      const { data: existingEntries } = await supabase
        .from("eod_entries")
        .select("*")
        .eq("report_id", activeReport.id)
        .order("created_at", { ascending: true });
      setEntries((existingEntries as EodEntry[]) || []);
    }

    setIsLoading(false);
  };

  const loadSiteOptions = async () => {
    setIsLoadingSites(true);
    setSiteOptionsError(null);
    const options = await getEodSiteOptions();
    if (options.length === 0) {
      setSiteOptionsError("Could not load site list — check sheet connectivity.");
    }
    setSiteOptions(options);
    setIsLoadingSites(false);
  };

  useEffect(() => {
    if (canSubmit && !isLoading && (report?.status !== "submitted" || isEditing)) loadSiteOptions();
  }, [canSubmit, isLoading, report?.status, isEditing]);

  const selectSite = async (site: EodSiteOption) => {
    setSelectedSite(site);
    setDraftPages([]);
    setSitePages([]);
    setSitePagesError(null);

    if (site.domain) {
      setIsLoadingPages(true);
      const { pages, error } = await getSitePages(site.domain);
      setSitePages(pages);
      setSitePagesError(error);
      setIsLoadingPages(false);
    }
  };

  const addManualSite = async () => {
    const name = manualSiteName.trim();
    if (!name) return;

    const site: EodSiteOption = {
      name,
      domain: manualSiteLink.trim() ? normalizeSiteLink(manualSiteLink) : null,
      status: "manual",
    };

    setManualSiteName("");
    setManualSiteLink("");
    setIsAddingManualSite(false);
    await selectSite(site);
  };

  const toggleSitemapPage = (page: EodSitePage) => {
    setDraftPages((current) => {
      const exists = current.find((p) => p.key === page.url);
      if (exists) return current.filter((p) => p.key !== page.url);
      return [
        ...current,
        { key: page.url, label: page.label, url: page.url, isNewPage: false, notes: "" },
      ];
    });
  };

  const addNewPage = () => {
    const trimmed = newPageName.trim();
    if (!trimmed) return;
    setDraftPages((current) => [
      ...current,
      { key: `new-${Date.now()}`, label: trimmed, url: null, isNewPage: true, notes: "" },
    ]);
    setNewPageName("");
  };

  const removeDraftPage = (key: string) => {
    setDraftPages((current) => current.filter((p) => p.key !== key));
  };

  const updateDraftNotes = (key: string, notes: string) => {
    setDraftPages((current) =>
      current.map((p) => (p.key === key ? { ...p, notes } : p))
    );
  };

  const canCommitSite =
    selectedSite &&
    draftPages.length > 0 &&
    draftPages.every((p) => p.notes.trim().length > 0);

  const commitSite = async () => {
    if (!selectedSite || !canCommitSite) return;
    setIsSaving(true);

    // Lazily create today's report row on the first commit — avoids leaving an
    // empty draft behind for anyone who opens the page but never adds anything.
    let activeReport = report;
    if (!activeReport) {
      const { data: created, error: createError } = await supabase
        .from("eod_reports")
        .insert({
          team_member_email: memberEmail,
          team_member_name: resolvedName,
          report_date: todayIso(),
        })
        .select("*")
        .single();

      if (createError || !created) {
        setIsSaving(false);
        return;
      }
      activeReport = created as EodReport;
      setReport(activeReport);
    }

    const rows = draftPages.map((p) => ({
      report_id: activeReport!.id,
      site_name: selectedSite.name,
      site_domain: selectedSite.domain,
      site_status: selectedSite.status,
      page_label: p.label,
      page_url: p.url,
      is_new_page: p.isNewPage,
      notes: p.notes.trim(),
    }));

    const { data, error } = await supabase.from("eod_entries").insert(rows).select("*");

    setIsSaving(false);

    if (!error && data) {
      setEntries((current) => [...current, ...(data as EodEntry[])]);
      setSelectedSite(null);
      setDraftPages([]);
      setSitePages([]);
      setSiteSearch("");
    }
  };

  const endEod = async () => {
    if (!report) return;
    if (!window.confirm("End today's EOD? You can still edit it afterward if needed.")) return;

    setIsFinalizing(true);
    const { data, error } = await supabase
      .from("eod_reports")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", report.id)
      .select("*")
      .single();
    setIsFinalizing(false);

    if (!error && data) {
      setReport(data as EodReport);
    }
  };

  const finishEditing = async () => {
    if (!report) {
      setIsEditing(false);
      return;
    }

    setIsFinalizing(true);
    const { data, error } = await supabase
      .from("eod_reports")
      .update({ submitted_at: new Date().toISOString() })
      .eq("id", report.id)
      .select("*")
      .single();
    setIsFinalizing(false);

    if (!error && data) setReport(data as EodReport);
    setSelectedSite(null);
    setDraftPages([]);
    setIsEditing(false);
  };

  const deleteEntry = async (entryId: number) => {
    const { error } = await supabase.from("eod_entries").delete().eq("id", entryId);
    if (!error) {
      setEntries((current) => current.filter((e) => e.id !== entryId));
    }
  };

  const isEditable = report?.status !== "submitted" || isEditing;

  const filteredSites = siteOptions.filter((s) =>
    s.name.toLowerCase().includes(siteSearch.toLowerCase())
  );

  const entriesBySite = Object.values(
    entries.reduce((groups: Record<string, { siteName: string; items: EodEntry[] }>, entry) => {
      if (!groups[entry.site_name]) {
        groups[entry.site_name] = { siteName: entry.site_name, items: [] };
      }
      groups[entry.site_name].items.push(entry);
      return groups;
    }, {})
  );

  if (authLoading || isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!canSubmit) {
    return (
      <div className="p-10 max-w-2xl mx-auto text-center mt-20 bg-rose-50 border border-rose-100 rounded-2xl">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Clearance Required</h1>
        <p className="text-gray-600">Only Developers and Managers can submit an EOD report.</p>
      </div>
    );
  }

  return (
    <main className="p-4 sm:p-8 max-w-4xl mx-auto w-full">
      <Link
        href="/dashboard"
        className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
      </Link>
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-amber-600 text-white rounded-xl shadow-sm">
          <ClipboardList className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">End of Day Report</h1>
          <p className="text-gray-500 text-sm mt-1">
            {resolvedName} · {report?.report_date}
          </p>
        </div>
      </div>

      {report?.status === "submitted" && !isEditing ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 mb-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <p className="font-bold text-emerald-800">Today's EOD has been submitted.</p>
              <p className="text-sm text-emerald-700">
                Submitted at {report.submitted_at ? new Date(report.submitted_at).toLocaleString() : ""}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 bg-white border border-emerald-300 text-emerald-700 rounded-lg text-sm font-bold hover:bg-emerald-100 transition-colors flex items-center gap-2 shrink-0"
          >
            <Pencil className="w-4 h-4" /> Edit EOD
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 mb-8">
          {!selectedSite ? (
            <>
              <h2 className="text-lg font-bold text-gray-900 mb-4">Select a site</h2>

              {isLoadingSites ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : (
                <>
                  {siteOptionsError && (
                    <div className="p-4 mb-4 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">
                      {siteOptionsError}
                    </div>
                  )}

                  {!siteOptionsError && (
                    <>
                      <div className="relative mb-4">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={siteSearch}
                          onChange={(e) => setSiteSearch(e.target.value)}
                          placeholder="Search sites..."
                          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                      </div>
                      <div className="max-h-96 overflow-y-auto space-y-1.5 pr-1 mb-4">
                        {filteredSites.map((site) => (
                          <button
                            key={site.name}
                            onClick={() => selectSite(site)}
                            className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all text-left"
                          >
                            <span className="font-medium text-sm text-gray-800">{site.name}</span>
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded shrink-0 ${
                                site.status === "live"
                                  ? "text-emerald-600 bg-emerald-50"
                                  : "text-amber-600 bg-amber-50"
                              }`}
                            >
                              {site.status === "live" ? "Live" : "Subdomain (domain not connected)"}
                            </span>
                          </button>
                        ))}
                        {filteredSites.length === 0 && (
                          <p className="text-sm text-gray-500 text-center py-6">No sites match your search.</p>
                        )}
                      </div>
                    </>
                  )}

                  {isAddingManualSite ? (
                    <div className="p-4 border border-blue-200 bg-blue-50/40 rounded-xl space-y-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Add site manually</p>
                      <input
                        type="text"
                        value={manualSiteName}
                        onChange={(e) => setManualSiteName(e.target.value)}
                        placeholder="Site name"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                      <input
                        type="text"
                        value={manualSiteLink}
                        onChange={(e) => setManualSiteLink(e.target.value)}
                        placeholder="Site link (optional, e.g. example.com)"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={addManualSite}
                          disabled={!manualSiteName.trim()}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                        >
                          <ArrowRight className="w-4 h-4" /> Continue
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsAddingManualSite(false);
                            setManualSiteName("");
                            setManualSiteLink("");
                          }}
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
                      className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-gray-300 text-sm font-medium text-gray-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/50 transition-all"
                    >
                      <PlusCircle className="w-4 h-4" /> Can't find your site? Add it manually
                    </button>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{selectedSite.name}</h2>
                  <p className="text-xs text-gray-400 flex items-center gap-1.5 mt-0.5">
                    <Globe className="w-3 h-3" />
                    {selectedSite.domain || "No domain on record"}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedSite(null);
                    setDraftPages([]);
                  }}
                  className="text-xs font-bold text-gray-400 hover:text-rose-600 flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
              </div>

              {isLoadingPages ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : (
                <>
                  {sitePagesError && (
                    <div className="p-3 mb-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                      {sitePagesError} — you can still add pages manually below.
                    </div>
                  )}

                  {sitePages.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                        Pages from sitemap
                      </p>
                      <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                        {sitePages.map((page) => {
                          const checked = draftPages.some((p) => p.key === page.url);
                          return (
                            <label
                              key={page.url}
                              className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                                checked ? "bg-blue-50 border-blue-200" : "border-gray-200 hover:border-blue-200"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSitemapPage(page)}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-sm text-gray-700 truncate">{page.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="mb-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Add new page</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newPageName}
                        onChange={(e) => setNewPageName(e.target.value)}
                        placeholder="e.g. New pricing page (not live yet)"
                        className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={addNewPage}
                        disabled={!newPageName.trim()}
                        className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors flex items-center gap-1.5 shrink-0"
                      >
                        <Plus className="w-4 h-4" /> Add
                      </button>
                    </div>
                  </div>

                  {draftPages.length > 0 && (
                    <div className="mb-4 space-y-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                        Selected pages — what changed?
                      </p>
                      {draftPages.map((p) => (
                        <div key={p.key} className="p-3 rounded-lg border border-gray-200 bg-gray-50/50">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                              {p.label}
                              {p.isNewPage && (
                                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">
                                  New
                                </span>
                              )}
                            </span>
                            <button
                              onClick={() => removeDraftPage(p.key)}
                              className="text-gray-300 hover:text-rose-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <textarea
                            value={p.notes}
                            onChange={(e) => updateDraftNotes(p.key, e.target.value)}
                            placeholder="Describe what changes were made on this page..."
                            rows={2}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={commitSite}
                    disabled={!canCommitSite || isSaving}
                    className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    Add to EOD
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Today's entries</h2>
          {isEditing ? (
            <button
              onClick={finishEditing}
              disabled={isFinalizing}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {isFinalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Done Editing
            </button>
          ) : (
            report?.status === "draft" && entries.length > 0 && (
              <button
                onClick={endEod}
                disabled={isFinalizing}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {isFinalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                End EOD
              </button>
            )
          )}
        </div>

        {entriesBySite.length === 0 ? (
          <p className="text-sm text-gray-500 italic py-6 text-center">No entries added yet today.</p>
        ) : (
          <div className="space-y-4">
            {entriesBySite.map((group) => {
              const siteDomain = group.items[0]?.site_domain;
              return (
                <div key={group.siteName} className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 font-bold text-sm text-gray-800">
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
                  </div>
                  <div className="divide-y divide-gray-100">
                    {group.items.map((entry) => (
                      <div key={entry.id} className="px-4 py-3 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
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
                          <p className="text-xs text-gray-500 mt-1">{entry.notes}</p>
                        </div>
                        {isEditable && (
                          <button
                            onClick={() => deleteEntry(entry.id)}
                            className="text-gray-300 hover:text-rose-500 shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
