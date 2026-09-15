// Shared "business time" engine — a working day here is the 3 PM–12 AM shift,
// Monday–Friday, excluding company holidays. Originally built for the
// website status "Time in Stage" counter (see WebsiteCard.tsx); reused as-is
// for Task time tracking so both features agree on what a working hour is.
const SHIFT_START_HOUR = 15; // 3 PM
const NINE_HOURS_MS = 9 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;

export type BusinessDuration = { days: number; hours: number; minutes: number };

export function calculateBusinessDuration(
  start: Date,
  end: Date,
  holidays: Set<string>
): BusinessDuration {
  if (start >= end) return { days: 0, hours: 0, minutes: 0 };

  let businessMs = 0;
  let current = new Date(start);

  while (current < end) {
    const nextHour = new Date(current);
    nextHour.setHours(current.getHours() + 1, 0, 0, 0);
    const stepEnd = nextHour < end ? nextHour : end;

    const day = current.getDay();
    const currentHour = current.getHours(); // 0-23

    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, "0");
    const dd = String(current.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;

    // 1. Exclude weekends (0 = Sun, 6 = Sat)
    // 2. Exclude company holidays
    // 3. Exclude off-hours (only count from 3 PM onward)
    if (day !== 0 && day !== 6 && !holidays.has(dateStr) && currentHour >= SHIFT_START_HOUR) {
      businessMs += stepEnd.getTime() - current.getTime();
    }

    current = stepEnd;
  }

  const days = Math.floor(businessMs / NINE_HOURS_MS);
  const remainingMs = businessMs % NINE_HOURS_MS;
  const hours = Math.floor(remainingMs / ONE_HOUR_MS);
  const minutes = Math.floor((remainingMs % ONE_HOUR_MS) / ONE_MINUTE_MS);

  return { days, hours, minutes };
}

export function formatBusinessDuration(d: BusinessDuration, longForm = false): string {
  if (d.days > 0) return longForm ? `${d.days}d ${d.hours}h ${d.minutes}m` : `${d.days}d ${d.hours}h`;
  if (d.hours > 0) return `${d.hours}h ${d.minutes}m`;
  return `${d.minutes}m`;
}
