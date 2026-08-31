"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { getWebsiteEditsTabs, appendToWebsiteEditsTab } from "@/app/websiteEditsActions";
import type { WebsiteEditsBlock, WebsiteEditsRun, WebsiteEditsTab } from "@/type/websiteEdits";
import {
  Loader2,
  ShieldAlert,
  FileEdit,
  Search,
  ArrowLeft,
  ExternalLink,
  PlusCircle,
} from "lucide-react";

const WEBSITE_EDITS_DOC_URL =
  "https://docs.google.com/document/d/1LoGRk5TxbPtRCZ4BUAtQyqmJdDXwfYQ9jLI_10mhAtU/edit?usp=sharing";

function RunText({ run }: { run: WebsiteEditsRun }) {
  const content = run.bold && run.italic ? (
    <b><i>{run.text}</i></b>
  ) : run.bold ? (
    <b>{run.text}</b>
  ) : run.italic ? (
    <i>{run.text}</i>
  ) : (
    run.text
  );

  if (run.link) {
    return (
      <a href={run.link} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
        {content}
      </a>
    );
  }
  return <>{content}</>;
}

function Block({ block }: { block: WebsiteEditsBlock }) {
  if (block.type === "heading") {
    const runs = block.runs.map((r, i) => <RunText key={i} run={r} />);
    const className = "font-bold text-gray-900 mt-5 mb-2 first:mt-0";
    if (block.level <= 2) return <h2 className={`text-lg ${className}`}>{runs}</h2>;
    if (block.level === 3) return <h3 className={`text-base ${className}`}>{runs}</h3>;
    return <h4 className={`text-sm ${className}`}>{runs}</h4>;
  }

  if (block.type === "paragraph") {
    if (!block.runs.some((r) => r.text.trim())) return null;
    const text = (
      <>
        {block.runs.map((r, i) => (
          <RunText key={i} run={r} />
        ))}
      </>
    );
    if (block.bullet) {
      return (
        <div className="flex gap-2 text-sm text-gray-700 leading-relaxed mb-1.5">
          <span className="text-gray-400 shrink-0">•</span>
          <p>{text}</p>
        </div>
      );
    }
    return <p className="text-sm text-gray-700 leading-relaxed mb-2 whitespace-pre-wrap">{text}</p>;
  }

  if (block.type === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={block.url} alt="" className="max-w-full rounded-lg border border-gray-200 my-3" />
    );
  }

  if (block.type === "table") {
    return (
      <div className="overflow-x-auto my-3">
        <table className="min-w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i} className="border-b border-gray-100 last:border-0">
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-2 border-r border-gray-100 last:border-0 text-gray-700">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}

export default function WebsiteEditsPage() {
  const { role, loading: authLoading } = useAuth();
  const canView = role === "developer" || role === "manager" || role === "admin";

  const [tabs, setTabs] = useState<WebsiteEditsTab[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const [showAddEntry, setShowAddEntry] = useState(false);
  const [newEntryText, setNewEntryText] = useState("");
  const [isAddingEntry, setIsAddingEntry] = useState(false);
  const [addEntryError, setAddEntryError] = useState<string | null>(null);

  useEffect(() => {
    if (canView) loadTabs();
  }, [canView]);

  const loadTabs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getWebsiteEditsTabs();
      if (data.length === 0) {
        setError("Could not load the Website Edits doc — check connectivity.");
      } else {
        setActiveTabId((current) => current ?? data[0].id);
      }
      setTabs(data);
    } catch {
      // Even if the server action call itself fails (network blip, deploy in
      // flight, etc.) the page must resolve out of the loading state.
      setError("Could not load the Website Edits doc — check connectivity.");
    } finally {
      setIsLoading(false);
    }
  };

  const selectTab = (tabId: string) => {
    setActiveTabId(tabId);
    setShowAddEntry(false);
    setNewEntryText("");
    setAddEntryError(null);
  };

  const submitNewEntry = async () => {
    if (!activeTabId || !newEntryText.trim()) return;

    setIsAddingEntry(true);
    setAddEntryError(null);

    const result = await appendToWebsiteEditsTab(activeTabId, newEntryText);

    if (!result.success) {
      setAddEntryError(result.error || "Could not save that entry.");
      setIsAddingEntry(false);
      return;
    }

    setNewEntryText("");
    setShowAddEntry(false);
    setIsAddingEntry(false);
    await loadTabs();
  };

  const filteredTabs = tabs.filter((t) =>
    t.title.toLowerCase().includes(search.trim().toLowerCase())
  );
  const activeTab = tabs.find((t) => t.id === activeTabId) || null;

  if (authLoading) {
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
        <p className="text-gray-600">Only Developers, Managers and Admins can access Website Edits.</p>
      </div>
    );
  }

  return (
    <main className="p-4 sm:p-8 max-w-6xl mx-auto w-full">
      <Link
        href="/dashboard"
        className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
      </Link>

      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-violet-600 text-white rounded-xl shadow-sm">
            <FileEdit className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Website Edits</h1>
            <p className="text-gray-500 text-sm mt-1">Per-site edit requests, pulled from the live doc</p>
          </div>
        </div>

        <a
          href={WEBSITE_EDITS_DOC_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:border-violet-300 hover:text-violet-700 transition-colors shrink-0"
        >
          <ExternalLink className="w-4 h-4" /> Open in Google Docs
        </a>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">{error}</div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-5">
          <div className="lg:w-64 shrink-0">
            <div className="relative mb-3">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tabs..."
                className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-white shadow-sm"
              />
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-2 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
              {filteredTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => selectTab(tab.id)}
                  style={{ paddingLeft: `${12 + tab.depth * 14}px` }}
                  className={`text-left px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap lg:whitespace-normal transition-colors shrink-0 ${
                    activeTabId === tab.id
                      ? "bg-violet-600 text-white"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {tab.title}
                </button>
              ))}
              {filteredTabs.length === 0 && (
                <p className="text-xs text-gray-400 px-3 py-4">No tabs match your search.</p>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0 bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            {activeTab ? (
              <>
                {activeTab.blocks.length > 0 ? (
                  <div>
                    {activeTab.blocks.map((block, i) => (
                      <Block key={i} block={block} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-10">This tab is empty.</p>
                )}

                <div className="mt-4 pt-4 border-t border-gray-100">
                  {addEntryError && (
                    <p className="text-sm text-rose-600 mb-3">{addEntryError}</p>
                  )}

                  {showAddEntry ? (
                    <div className="space-y-2">
                      <textarea
                        value={newEntryText}
                        onChange={(e) => setNewEntryText(e.target.value)}
                        placeholder={`Add a new edit request for ${activeTab.title}...`}
                        rows={4}
                        autoFocus
                        className="w-full p-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={submitNewEntry}
                          disabled={isAddingEntry || !newEntryText.trim()}
                          className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-bold hover:bg-violet-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                        >
                          {isAddingEntry ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                          {isAddingEntry ? "Saving to doc..." : "Add to doc"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddEntry(false);
                            setNewEntryText("");
                            setAddEntryError(null);
                          }}
                          disabled={isAddingEntry}
                          className="px-4 py-2 text-gray-500 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="text-xs text-gray-400">This writes directly to the Google Doc, right after the existing content on this tab.</p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAddEntry(true)}
                      className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-gray-300 text-sm font-medium text-gray-500 hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50/50 transition-all"
                    >
                      <PlusCircle className="w-4 h-4" /> Add a new edit request to this tab
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400 text-center py-10">Select a tab to view its edit requests.</p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
