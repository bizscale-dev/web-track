"use client";

import { useState } from "react";
import { DEFAULT_WEBSITE_PAGES, PAGE_STATUSES } from "@/lib/statuses";
import { supabase } from "@/lib/supabase";
import type { WebsiteActivityLog, WebsitePage } from "@/type/website";

type WebsitePagesManagerProps = {
  websiteId: number;
  initialPages: WebsitePage[];
  pagesLoadError?: string | null;
  onActivityLogged: (log: WebsiteActivityLog) => void;
};

export default function WebsitePagesManager({
  websiteId,
  initialPages,
  pagesLoadError,
  onActivityLogged,
}: WebsitePagesManagerProps) {
  const [pages, setPages] = useState(initialPages);
  const [newPageTitle, setNewPageTitle] = useState("");
  const [newPageUrl, setNewPageUrl] = useState("");
  const [savingPageIds, setSavingPageIds] = useState<number[]>([]);
  const [isCreatingDefaults, setIsCreatingDefaults] = useState(false);
  const [isAddingPage, setIsAddingPage] = useState(false);
  const [error, setError] = useState<string | null>(pagesLoadError || null);

  async function logActivity(
    eventType: string,
    message: string,
    oldValue?: string | null,
    newValue?: string | null
  ) {
    const { data, error: logError } = await supabase
      .from("website_activity_logs")
      .insert({
        website_id: websiteId,
        event_type: eventType,
        old_value: oldValue,
        new_value: newValue,
        message,
      })
      .select("*")
      .single<WebsiteActivityLog>();

    if (!logError && data) {
      onActivityLogged(data);
    }
  }

  async function createDefaultPages() {
    setError(null);
    setIsCreatingDefaults(true);

    const rows = DEFAULT_WEBSITE_PAGES.map((title, index) => ({
      website_id: websiteId,
      title,
      page_url: null,
      sort_order: index,
    }));

    const { data, error: insertError } = await supabase
      .from("website_pages")
      .insert(rows)
      .select("*")
      .order("sort_order", { ascending: true })
      .returns<WebsitePage[]>();

    setIsCreatingDefaults(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setPages(data ?? []);
    await logActivity(
      "pages_created",
      "Default website pages were created",
      null,
      DEFAULT_WEBSITE_PAGES.join(", ")
    );
  }

  async function addPage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = newPageTitle.trim();

    if (!title) {
      return;
    }

    setError(null);
    setIsAddingPage(true);

    const { data, error: insertError } = await supabase
      .from("website_pages")
      .insert({
        website_id: websiteId,
        title,
        page_url: newPageUrl.trim() || null,
        sort_order: pages.length,
      })
      .select("*")
      .single<WebsitePage>();

    setIsAddingPage(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "Page could not be created.");
      return;
    }

    setPages((currentPages) => [...currentPages, data]);
    setNewPageTitle("");
    setNewPageUrl("");
    await logActivity("page_added", `Page added: ${title}`, null, title);
  }

  async function updatePageUrl(pageId: number, nextUrl: string) {
    const page = pages.find((currentPage) => currentPage.id === pageId);

    if (!page || page.page_url === nextUrl) {
      return;
    }

    const previousUrl = page.page_url;
    const cleanUrl = nextUrl.trim() || null;

    setError(null);
    setSavingPageIds((ids) => [...ids, pageId]);
    setPages((currentPages) =>
      currentPages.map((currentPage) =>
        currentPage.id === pageId
          ? { ...currentPage, page_url: cleanUrl }
          : currentPage
      )
    );

    const { error: updateError } = await supabase
      .from("website_pages")
      .update({ page_url: cleanUrl })
      .eq("id", pageId);

    setSavingPageIds((ids) => ids.filter((id) => id !== pageId));

    if (updateError) {
      setPages((currentPages) =>
        currentPages.map((currentPage) =>
          currentPage.id === pageId
            ? { ...currentPage, page_url: previousUrl }
            : currentPage
        )
      );
      setError(updateError.message);
      return;
    }

    await logActivity(
      "page_link_updated",
      `${page.title} link updated`,
      previousUrl,
      cleanUrl
    );
  }

  async function updatePageStatus(pageId: number, nextStatus: string) {
    const page = pages.find((currentPage) => currentPage.id === pageId);

    if (!page || page.status === nextStatus) {
      return;
    }

    const previousStatus = page.status;

    setError(null);
    setSavingPageIds((ids) => [...ids, pageId]);
    setPages((currentPages) =>
      currentPages.map((currentPage) =>
        currentPage.id === pageId
          ? { ...currentPage, status: nextStatus }
          : currentPage
      )
    );

    const { error: updateError } = await supabase
      .from("website_pages")
      .update({ status: nextStatus })
      .eq("id", pageId);

    setSavingPageIds((ids) => ids.filter((id) => id !== pageId));

    if (updateError) {
      setPages((currentPages) =>
        currentPages.map((currentPage) =>
          currentPage.id === pageId
            ? { ...currentPage, status: previousStatus }
            : currentPage
        )
      );
      setError(updateError.message);
      return;
    }

    await logActivity(
      "page_status_changed",
      `${page.title} changed from ${previousStatus} to ${nextStatus}`,
      previousStatus,
      nextStatus
    );
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Page Tracking</h2>
          <p className="mt-1 text-sm text-gray-500">
            Track each website page through content, review, and completion.
          </p>
        </div>

        {pages.length === 0 ? (
          <button
            type="button"
            className="h-10 rounded-md bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            disabled={isCreatingDefaults}
            onClick={createDefaultPages}
          >
            {isCreatingDefaults ? "Creating..." : "Create default pages"}
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {error}
        </div>
      ) : null}

      <form
        onSubmit={addPage}
        className="mb-5 grid gap-3 lg:grid-cols-[1fr_1.4fr_auto]"
      >
        <input
          className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm shadow-sm outline-none focus:border-gray-500"
          placeholder="Add a page, e.g. Pricing"
          value={newPageTitle}
          onChange={(event) => setNewPageTitle(event.target.value)}
        />
        <input
          className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm shadow-sm outline-none focus:border-gray-500"
          placeholder="Page link, e.g. https://site.com/pricing"
          value={newPageUrl}
          onChange={(event) => setNewPageUrl(event.target.value)}
        />
        <button
          type="submit"
          className="h-10 rounded-md border border-gray-300 bg-white px-4 text-sm font-semibold shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
          disabled={isAddingPage}
        >
          {isAddingPage ? "Adding..." : "Add page"}
        </button>
      </form>

      {pages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
          No tracked pages yet.
        </div>
      ) : (
        <div className="space-y-3">
          {pages.map((page) => (
            <div
              key={page.id}
              className="grid gap-4 rounded-lg border border-gray-200 p-4 lg:grid-cols-[1fr_1.4fr_auto]"
            >
              <div>
                <p className="font-semibold">{page.title}</p>
                {page.notes ? (
                  <p className="mt-1 text-sm text-gray-500">{page.notes}</p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <input
                  className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm shadow-sm outline-none focus:border-gray-500"
                  placeholder="Page link"
                  defaultValue={page.page_url || ""}
                  disabled={savingPageIds.includes(page.id)}
                  onBlur={(event) =>
                    updatePageUrl(page.id, event.currentTarget.value)
                  }
                />
                {page.page_url ? (
                  <a
                    href={page.page_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    Open page link
                  </a>
                ) : null}
              </div>

              <div className="flex items-center gap-3 lg:justify-end">
                {savingPageIds.includes(page.id) ? (
                  <span className="text-xs font-medium text-gray-500">
                    Saving...
                  </span>
                ) : null}

                <select
                  className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium shadow-sm"
                  value={page.status}
                  disabled={savingPageIds.includes(page.id)}
                  onChange={(event) =>
                    updatePageStatus(page.id, event.target.value)
                  }
                >
                  {PAGE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
