import Link from "next/link";
import type { ReactNode } from "react";
import type { Cohort } from "@/types/cohort";
import { programs } from "@/content/programs";
import { RELATIONSHIP_LABELS, isRelationship, type PlayerRecord } from "@/lib/players";
import { AGE_BAND_LABELS } from "@/lib/ageBand";
import { hasLevel, placedSpanFor, type PlacedSpan } from "@/lib/tiers";
import { ENROLLMENT_CHIP, enrollmentState, type DashEnrollment } from "@/lib/dashboardState";
import { RankCard } from "@/components/tiers";
import { ProfileForm } from "./ProfileForm";
import { PlayerEditor } from "./PlayerEditor";

// /profile's presentation (audit M34). The page (page.tsx) reads everything
// behind the holder's session; this renders it: the holder's own RankCard
// (only when they are one of the players, audit M26), their contact form,
// every other player on the account with their tier and Edit / Remove, and
// the enrollments with their state in words.

/** "Oct 17, 2026" from "2026-10-17", read as a calendar date (no time-zone shift). */
function fmtDate(iso: string): string {
  const [y, mo, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Enrollment chips read the row's state in words (audit M34), the same
// mapping as the dashboard (src/lib/dashboardState.ts): never a raw status.
const CHIP_TONE: Record<"lime" | "neutral" | "warn" | "muted", string> = {
  lime: "bg-[#B4E655]/10 text-[#B4E655]",
  neutral: "border border-white/15 bg-white/5 text-white/85",
  warn: "border border-amber-300/30 bg-amber-300/10 text-amber-100",
  muted: "border border-dashed border-white/25 text-white/75",
};

/** "My child · Junior (7–13)" — the relationship and the age group. */
function playerLine(p: PlayerRecord): string {
  const rel = isRelationship(p.relationship) ? RELATIONSHIP_LABELS[p.relationship] : "";
  const age = p.age_band ? AGE_BAND_LABELS[p.age_band] : p.is_minor ? "Under 18" : "";
  return [rel, age].filter(Boolean).join(" · ");
}

function SectionTitle({
  as: Tag = "h2",
  id,
  sub,
  children,
}: {
  as?: "h1" | "h2";
  id?: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="mb-4 border-l-2 border-[#B4E655] pl-4">
        <Tag id={id} className="text-xl font-semibold text-white">
          {children}
        </Tag>
        {sub && <p className="mt-1 text-sm text-white/60">{sub}</p>}
      </div>
      <div className="mb-6 border-b border-white/10" />
    </>
  );
}

export function ProfileView({
  email,
  fullName,
  phone,
  holder,
  holderPlacedSpan,
  others,
  enrollments,
  cohorts,
}: {
  email: string;
  fullName: string;
  phone: string;
  /** The holder's own player record, or null when they don't train (audit M26). */
  holder: PlayerRecord | null;
  holderPlacedSpan: PlacedSpan | null;
  /** Everyone else on the account. */
  others: PlayerRecord[];
  enrollments: DashEnrollment[];
  cohorts: Cohort[];
}) {
  return (
    <>
      {/* Profile details */}
      <section className="mb-12">
        <SectionTitle as="h1">Profile</SectionTitle>
        {holder && (
          <RankCard
            player={holder}
            layout="compact"
            isSelf
            placedSpan={holderPlacedSpan}
            assessmentLink={enrollments.length === 0}
            headingLevel="h2"
            className="mb-8"
          />
        )}
        <ProfileForm email={email} initialFullName={fullName} initialPhone={phone} />
      </section>

      {/* Players on this account (audit M34) */}
      {others.length > 0 && (
        <section className="mb-12" aria-labelledby="players-on-account">
          <SectionTitle id="players-on-account" sub="Each player's name, age group and tier. Sina sets every level.">
            Players on this account
          </SectionTitle>
          <ul className="space-y-4">
            {others.map((p) => (
              <li key={p.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
                <p className="text-base font-semibold text-white">
                  {p.full_name?.trim() || "Unnamed player"}
                </p>
                <p className="text-xs text-white/60">{playerLine(p) || "Age group not set"}</p>
                <RankCard
                  player={p}
                  layout="compact"
                  isSelf={false}
                  placedSpan={placedSpanFor(
                    p,
                    enrollments,
                    cohorts.filter((c) => c.dbStatus !== "cancelled")
                  )}
                  headingLevel="h3"
                  className="mt-4"
                />
                <PlayerEditor
                  id={p.id}
                  name={p.full_name?.trim() ?? ""}
                  ageBand={p.age_band ?? null}
                  removable={!hasLevel(p.level)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Enrollments */}
      <section>
        <SectionTitle>My enrollments</SectionTitle>

        {enrollments.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-white/60">No enrollments yet.</p>
            <Link
              href="/programs"
              className="inline-flex min-h-[44px] items-center rounded-full border border-white/25 px-5 text-sm font-semibold text-white/80 transition hover:border-white/45 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
            >
              Browse Programs
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {enrollments.map((e) => {
              const cohort = cohorts.find((c) => c.id === e.cohort_id);
              const program = programs.find((p) => p.id === (cohort?.programId ?? e.program));
              const chip = ENROLLMENT_CHIP[enrollmentState(e, cohort)];
              return (
                <li
                  key={e.id}
                  className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-white">
                      {program?.title ?? e.program ?? e.cohort_id}
                    </p>
                    <p className="mt-0.5 text-sm text-white/60">
                      {[
                        cohort ? `${fmtDate(cohort.startDate)} – ${fmtDate(cohort.endDate)}` : null,
                        e.participant_name ? `Player: ${e.participant_name}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span
                    className={`inline-flex min-h-6 shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${CHIP_TONE[chip.tone]}`}
                  >
                    {chip.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

