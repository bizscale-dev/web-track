"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

// Known route segments get a readable label; anything else (dynamic ids,
// unrecognized segments) falls back to a humanized version of the slug
// itself rather than guessing.
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  tasks: "Tasks Management",
  overview: "Overview",
  "site-reviews": "Site Reviews",
  "website-edits": "Website Edits",
  requirements: "Requirements Board",
  admin: "Command Center",
  timelines: "Timelines",
  eod: "EOD Report",
  "production-bugs": "Production Bugs",
  kpis: "KPIs",
  websites: "Websites",
  new: "Add Website",
};

function humanize(segment: string): string {
  if (/^[0-9a-f-]{6,}$/i.test(segment)) return "Details";
  return segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function RouteBreadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  const crumbs = segments.map((seg, i) => ({
    href: "/" + segments.slice(0, i + 1).join("/"),
    label: SEGMENT_LABELS[seg] || humanize(seg),
  }));

  // The dashboard page is the implicit root — don't show it twice when
  // that's also the current page.
  const showRootCrumb = pathname !== "/dashboard";

  return (
    <div className="flex items-center gap-2 flex-wrap text-xs font-semibold">
      {showRootCrumb && (
        <Link href="/dashboard" className="text-slate-400 hover:text-slate-600 transition-colors">
          Dashboard
        </Link>
      )}
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.href} className="flex items-center gap-2">
            {(showRootCrumb || i > 0) && <ChevronRight className="w-3 h-3 text-slate-300" />}
            {isLast ? (
              <span className="text-slate-700">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="text-slate-400 hover:text-slate-600 transition-colors">
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
      <span className="ml-2 px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 font-mono text-[10px] tracking-wide">
        WORKSPACE: BIZSCALE
      </span>
    </div>
  );
}
