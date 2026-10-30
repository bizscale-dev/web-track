"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Eye, X, ClipboardCheck, ListChecks, BarChart3 } from "lucide-react";

// Shown on Tasks Overview / EOD Overview / KPIs when an admin follows the
// "View as HR" link from Command Center — reads the query string directly
// (not useSearchParams, which would force these pages behind a Suspense
// boundary) so it works as a plain client-side lens on top of whatever the
// admin's own session already renders.
export default function HrViewBanner() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(new URLSearchParams(window.location.search).get("viewAs") === "hr");
  }, [pathname]);

  if (!active) return null;

  const links = [
    { href: "/tasks/overview", label: "Tasks Overview", icon: ClipboardCheck },
    { href: "/eod/overview", label: "EOD Overview", icon: ListChecks },
    { href: "/kpis", label: "KPIs", icon: BarChart3 },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-2xl bg-amber-50 border border-amber-200 mb-5 text-sm">
      <Eye className="w-4 h-4 text-amber-600 shrink-0" />
      <span className="font-bold text-amber-800">Viewing as HR</span>
      <span className="text-amber-700/70 hidden sm:inline">— this is what HR sees here</span>
      <div className="flex items-center gap-1 ml-auto flex-wrap">
        {links.map((l) => {
          const Icon = l.icon;
          const isCurrent = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={`${l.href}?viewAs=hr`}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-colors ${
                isCurrent ? "bg-amber-600 text-white" : "bg-white text-amber-700 border border-amber-200 hover:bg-amber-100"
              }`}
            >
              <Icon className="w-3 h-3" /> {l.label}
            </Link>
          );
        })}
        <Link
          href={pathname}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors ml-1"
        >
          <X className="w-3 h-3" /> Exit HR View
        </Link>
      </div>
    </div>
  );
}
