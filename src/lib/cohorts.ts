import { cohorts } from "@/content/cohorts";
import type { Cohort } from "@/types/cohort";
import { locations } from "@/content/locations";

export function cohortsForProgram(programId: string): Cohort[] {
  return cohorts.filter((c) => c.programId === programId);
}

export function nextCohortForProgram(programId: string): Cohort | undefined {
  return cohorts
    .filter(
      (c) =>
        c.programId === programId &&
        (c.status === "open" || c.status === "upcoming")
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
}

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
  const location = locations.find((l) => l.id === c.locationId);
  const locationLabel = location ? location.name : c.locationId;

  const days = c.sessions.map((s) => s.day).join(" & ");
  const startTime = formatTime(c.sessions[0].start);
  const endTime = formatTime(c.sessions[0].end);
  const dateRange = `${formatMonth(c.startDate)} – ${formatMonth(c.endDate)}`;

  return `${c.weeks}-week program · ${dateRange} · ${days} ${startTime}–${endTime} · ${c.capacityMin}–${c.capacityMax} players · ${locationLabel}`;
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
