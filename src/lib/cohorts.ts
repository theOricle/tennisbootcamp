import type { Cohort } from "@/types/cohort";

// Cohort data lives in Supabase (public.cohorts, migration 0004) — server code
// reads it through src/lib/cohortsDb.ts. The helpers below format whatever
// Cohort they're given; none of them name a venue (court details are confirmed
// in the booking email).

function formatMonth(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${m.toString().padStart(2, "0")}${suffix}`;
}

export function formatCohortSchedule(c: Cohort): string {
  const days = c.sessions.map((s) => s.day).join(" & ");
  const startTime = formatTime(c.sessions[0].start);
  const endTime = formatTime(c.sessions[0].end);
  const dateRange = `${formatMonth(c.startDate)} – ${formatMonth(c.endDate)}`;

  return `${c.weeks}-week program · ${dateRange} · ${days} ${startTime}–${endTime} · ${c.capacityMin}–${c.capacityMax} players`;
}

export function formatCohortPrice(c: Cohort): string {
  if (c.priceCents === 0) return "Pricing TBA";
  return `$${(c.priceCents / 100).toFixed(0)} ${c.currency}`;
}

export function formatDateRange(c: Cohort): string {
  return `${formatMonth(c.startDate)} – ${formatMonth(c.endDate)}`;
}

export function formatDaysTimes(c: Cohort): string {
  const days = c.sessions.map((s) => s.day).join(" & ");
  const start = formatTime(c.sessions[0].start);
  const end = formatTime(c.sessions[0].end);
  return `${days} · ${start}–${end}`;
}
