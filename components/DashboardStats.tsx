import type { Website } from "@/type/website";
import { WEBSITE_STATUSES } from "@/lib/statuses";
import { CheckCircle2, Clock3, Flame, FolderOpen } from "lucide-react";
import type { ReactNode } from "react";

type DashboardStatsProps = {
  websites: Website[];
};

export default function DashboardStats({ websites }: DashboardStatsProps) {
  const completed = websites.filter(
    (website) => website.status === "Completed"
  ).length;
  const inProgress = websites.length - completed;
  const highPriority = websites.filter(
    (website) => website.priority?.toLowerCase() === "high"
  ).length;

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon={<FolderOpen className="h-4 w-4" />}
        label="Total Websites"
        value={websites.length}
        accent="from-slate-900 to-slate-700"
      />
      <StatCard
        icon={<Clock3 className="h-4 w-4" />}
        label="In Progress"
        value={inProgress}
        accent="from-sky-600 to-cyan-500"
      />
      <StatCard
        icon={<CheckCircle2 className="h-4 w-4" />}
        label="Completed"
        value={completed}
        accent="from-emerald-600 to-teal-500"
      />
      <StatCard
        icon={<Flame className="h-4 w-4" />}
        label="High Priority"
        value={highPriority}
        accent="from-amber-500 to-orange-500"
      />

      <div className="rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur sm:col-span-2 xl:col-span-4">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Status Breakdown</p>
          <p className="text-xs text-slate-500">{websites.length} tracked items</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {WEBSITE_STATUSES.map((status, index) => {
            const count = websites.filter(
              (website) => website.status === status
            ).length;
            const palette = STATUS_PALETTES[index % STATUS_PALETTES.length];

            return (
              <div
                key={status}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className={`h-2.5 w-2.5 rounded-full bg-gradient-to-r ${palette}`} />
                  <span className="text-sm font-medium text-slate-600">{status}</span>
                </div>
                <span className="text-lg font-bold text-slate-950">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {label}
          </p>
          <p className="mt-3 text-4xl font-black tracking-tight text-slate-950">
            {value}
          </p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} text-white shadow-lg`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

const STATUS_PALETTES = [
  "from-slate-800 to-slate-500",
  "from-sky-600 to-cyan-500",
  "from-emerald-600 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-violet-600 to-fuchsia-500",
  "from-rose-600 to-pink-500",
  "from-indigo-600 to-blue-500",
];
