import "server-only";
import { randomBytes } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { getCohortById } from "@/lib/cohortsDb";
import type { Cohort } from "@/types/cohort";
import {
  generateSessionDates,
  planMakeup,
  currentEndDate,
  dayNameForDate,
  normTime,
  type ExistingSession,
} from "@/lib/makeup";
import { findUserIdByEmail } from "@/lib/assessments";
import { programs } from "@/content/programs";
import { findUnusedCredit } from "@/lib/assessmentCredit";
import { tierRangeForLevels } from "@/lib/tiers";
import {
  sendCohortInviteEmail,
  sendCohortConfirmedEmail,
  sendSessionCancelledEmail,
} from "@/lib/email";

// Server-side cohort operations (Phase 3): invite flow with expiring holds,
// minimum-to-run confirmation, session generation, and cancellation → make-up
// appending per src/lib/makeup.ts. All writes go through the service-role
// client, matching the enrollments/assessments model.

// ─── Row shapes ───────────────────────────────────────────────────────────────

export type InviteRow = {
  id: string;
  cohort_id: string;
  email: string;
  user_id: string | null;
  token: string;
  status: "invited" | "paid" | "declined" | "expired";
  invited_at: string;
  expires_at: string;
};

export type SessionRow = {
  id: string;
  cohort_id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: "scheduled" | "completed" | "cancelled";
  cancellation_reason: string | null;
  makeup_for: string | null;
  created_at: string;
};

// ─── Formatting helpers (shared by emails) ────────────────────────────────────

function fmtTime(t: string): string {
  const [h, m] = normTime(t).split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

function fmtDateLong(iso: string): string {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function fmtDateShort(iso: string): string {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const DAY_PLURAL: Record<string, string> = {
  Mon: "Mondays",
  Tue: "Tuesdays",
  Wed: "Wednesdays",
  Thu: "Thursdays",
  Fri: "Fridays",
  Sat: "Saturdays",
  Sun: "Sundays",
};

/** "Tuesdays & Thursdays 6–7pm" from a cohort's weekly slots. */
export function cohortDayTimeLabel(cohort: Cohort): string {
  if (cohort.sessions.length === 0) return "Schedule to be confirmed";
  const days = cohort.sessions
    .map((s) => DAY_PLURAL[s.day] ?? s.day)
    .join(" & ");
  const first = cohort.sessions[0];
  return `${days} ${fmtTime(first.start)}–${fmtTime(first.end)}`;
}

function programTitle(programId: string): string {
  return programs.find((p) => p.id === programId)?.title ?? programId;
}

/** "3.0" for a single-level band, "3.0–3.5" for a spread, null when untiered. */
export function cohortLevelLabel(cohort: Cohort): string | null {
  const min = cohort.levelMin ?? cohort.levelMax;
  const max = cohort.levelMax ?? cohort.levelMin;
  if (min == null || max == null) return null;
  return min === max ? min.toFixed(1) : `${min.toFixed(1)}–${max.toFixed(1)}`;
}

// ─── Invites ──────────────────────────────────────────────────────────────────

function newToken(): string {
  return randomBytes(24).toString("hex");
}

const siteUrl = () =>
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Flip stale invited rows to expired. Called lazily on every invite read. */
export async function expireStaleInvites(cohortId?: string): Promise<void> {
  const supabase = createServiceClient();
  let query = supabase
    .from("cohort_invites")
    .update({ status: "expired" })
    .eq("status", "invited")
    .lt("expires_at", new Date().toISOString());
  if (cohortId) query = query.eq("cohort_id", cohortId);
  await query;
}

export async function listInvites(cohortId: string): Promise<InviteRow[]> {
  await expireStaleInvites(cohortId);
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("cohort_invites")
    .select("*")
    .eq("cohort_id", cohortId)
    .order("invited_at", { ascending: false });
  return (data as InviteRow[]) ?? [];
}

/**
 * Invite a set of emails to a cohort: one personal single-use token each, a
 * hold of cohort.invite_hold_hours, and the branded invite email (with the
 * invitee's $20 credit already shown in the price math when they have one).
 * A draft cohort flips to `inviting`. Re-inviting an email issues a fresh
 * token — that's also the "re-invite after expiry" path.
 */
export async function createInvites(
  cohortId: string,
  emails: string[]
): Promise<{ sent: number; errors: string[] }> {
  const cohort = await getCohortById(cohortId);
  if (!cohort || !cohort.dbStatus) {
    return { sent: 0, errors: ["Cohort not found in the database."] };
  }
  if (!["draft", "inviting"].includes(cohort.dbStatus)) {
    return {
      sent: 0,
      errors: [`Cohort is ${cohort.dbStatus} — invites go out from draft or inviting.`],
    };
  }

  const supabase = createServiceClient();
  const holdHours = cohort.inviteHoldHours ?? 48;
  const range = tierRangeForLevels(cohort.levelMin, cohort.levelMax);
  const tierNames = range
    ? range.min.id === range.max.id
      ? [range.min.name]
      : [range.min.name, range.max.name]
    : [];

  const errors: string[] = [];
  let sent = 0;

  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (raw.trim()) errors.push(`"${raw.trim()}" doesn't look like an email.`);
      continue;
    }

    const token = newToken();
    const expiresAt = new Date(Date.now() + holdHours * 3600 * 1000).toISOString();
    const userId = await findUserIdByEmail(email);

    const { error } = await supabase.from("cohort_invites").insert({
      cohort_id: cohortId,
      email,
      user_id: userId,
      token,
      status: "invited",
      expires_at: expiresAt,
    });
    if (error) {
      errors.push(`${email}: ${error.message}`);
      continue;
    }

    const credit = await findUnusedCredit(email);
    const enrollUrl = `${siteUrl()}/enroll/${cohortId}?invite=${token}`;
    await sendCohortInviteEmail({
      to: email,
      levelLabel: cohortLevelLabel(cohort),
      tierNames,
      programTitle: programTitle(cohort.programId),
      cohortLabel: cohort.label,
      dayTimeLabel: cohortDayTimeLabel(cohort),
      startDateLabel: fmtDateShort(cohort.startDate),
      weeks: cohort.weeks,
      priceCents: cohort.priceCents,
      creditCents: credit ? Math.min(credit.creditCents, cohort.priceCents) : 0,
      holdHours,
      enrollUrl,
    }).catch((err) =>
      console.error(`Invite email to ${email} failed (non-blocking):`, err)
    );
    sent++;
  }

  if (sent > 0 && cohort.dbStatus === "draft") {
    await supabase.from("cohorts").update({ status: "inviting" }).eq("id", cohortId);
  }

  return { sent, errors };
}

export type InviteLookup =
  | { state: "valid"; invite: InviteRow }
  | { state: "expired" }
  | { state: "invalid" };

/**
 * Resolve an invite token for the enroll page. Expires on read: a stale
 * `invited` row flips to `expired` before answering. A `paid` invite stays
 * valid so the payer can revisit their confirmation.
 */
export async function getInviteByToken(
  cohortId: string,
  token: string
): Promise<InviteLookup> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("cohort_invites")
    .select("*")
    .eq("token", token)
    .eq("cohort_id", cohortId)
    .maybeSingle();
  if (!data) return { state: "invalid" };

  const invite = data as InviteRow;
  if (invite.status === "invited" && invite.expires_at < new Date().toISOString()) {
    await supabase
      .from("cohort_invites")
      .update({ status: "expired" })
      .eq("id", invite.id)
      .eq("status", "invited");
    return { state: "expired" };
  }
  if (invite.status === "expired") return { state: "expired" };
  if (invite.status === "declined") return { state: "invalid" };
  return { state: "valid", invite };
}

// ─── Confirmation ─────────────────────────────────────────────────────────────

/** Distinct member emails: paid invites plus paid/test-paid enrollments. */
export async function memberEmails(cohortId: string): Promise<string[]> {
  const supabase = createServiceClient();
  const [{ data: invites }, { data: enrollments }] = await Promise.all([
    supabase
      .from("cohort_invites")
      .select("email")
      .eq("cohort_id", cohortId)
      .eq("status", "paid"),
    supabase
      .from("enrollments")
      .select("contact_email")
      .eq("cohort_id", cohortId)
      .in("status", ["paid", "test_paid"]),
  ]);
  const set = new Set<string>();
  for (const r of invites ?? []) {
    const e = (r as { email: string }).email?.trim().toLowerCase();
    if (e) set.add(e);
  }
  for (const r of enrollments ?? []) {
    const e = (r as { contact_email: string | null }).contact_email?.trim().toLowerCase();
    if (e) set.add(e);
  }
  return [...set];
}

/**
 * Generate the cohort's dated session rows if none exist yet (on confirmation,
 * and lazily for seeded already-confirmed cohorts). The unique index on
 * (cohort_id, session_date, start_time) makes double-generation harmless.
 */
export async function ensureCohortSessions(cohortId: string): Promise<void> {
  const cohort = await getCohortById(cohortId);
  if (!cohort || !cohort.dbStatus) return;

  const supabase = createServiceClient();
  const { count } = await supabase
    .from("cohort_sessions")
    .select("id", { count: "exact", head: true })
    .eq("cohort_id", cohortId);
  if ((count ?? 0) > 0) return;

  const planned = generateSessionDates(cohort.startDate, cohort.weeks, cohort.sessions);
  if (planned.length === 0) return;
  await supabase.from("cohort_sessions").upsert(
    planned.map((p) => ({
      cohort_id: cohortId,
      session_date: p.date,
      start_time: p.start,
      end_time: p.end,
      status: "scheduled",
    })),
    { onConflict: "cohort_id,session_date,start_time", ignoreDuplicates: true }
  );
}

export async function listSessions(cohortId: string): Promise<SessionRow[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("cohort_sessions")
    .select("*")
    .eq("cohort_id", cohortId)
    .order("session_date", { ascending: true })
    .order("start_time", { ascending: true });
  return (data as SessionRow[]) ?? [];
}

function sessionLine(s: SessionRow): string {
  const day = dayNameForDate(s.session_date);
  const base = `${day} ${fmtDateShort(s.session_date)} · ${fmtTime(s.start_time)}–${fmtTime(s.end_time)}`;
  return s.makeup_for ? `${base} (make-up)` : base;
}

/**
 * Mark the invite paid (by token when present, else the newest live invite for
 * that email) and confirm the cohort once paid invites reach capacity_min:
 * status → confirmed, sessions generated, confirmed email to every member.
 * Called from the Stripe webhook and the mock-mode checkout path.
 */
export async function markInvitePaidAndMaybeConfirm(params: {
  cohortId: string;
  email?: string;
  inviteToken?: string;
}): Promise<void> {
  const { cohortId, email, inviteToken } = params;
  const supabase = createServiceClient();

  if (inviteToken) {
    await supabase
      .from("cohort_invites")
      .update({ status: "paid" })
      .eq("token", inviteToken)
      .eq("cohort_id", cohortId)
      .in("status", ["invited", "expired"]); // paying inside checkout honors a hold that lapsed mid-payment
  } else if (email) {
    const { data } = await supabase
      .from("cohort_invites")
      .select("id")
      .eq("cohort_id", cohortId)
      .ilike("email", email.trim())
      .in("status", ["invited", "expired"])
      .order("invited_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      await supabase
        .from("cohort_invites")
        .update({ status: "paid" })
        .eq("id", (data as { id: string }).id);
    }
  }

  await maybeConfirmCohort(cohortId);
}

/** Confirm when paid invites reach the minimum; idempotent. */
export async function maybeConfirmCohort(cohortId: string): Promise<void> {
  const cohort = await getCohortById(cohortId);
  if (!cohort || !cohort.dbStatus) return;
  if (!["draft", "inviting"].includes(cohort.dbStatus)) return;

  const supabase = createServiceClient();
  const { count } = await supabase
    .from("cohort_invites")
    .select("id", { count: "exact", head: true })
    .eq("cohort_id", cohortId)
    .eq("status", "paid");
  if ((count ?? 0) < cohort.capacityMin) return;

  // Guarded flip — only one caller wins on concurrent webhooks.
  const { data: flipped } = await supabase
    .from("cohorts")
    .update({ status: "confirmed" })
    .eq("id", cohortId)
    .in("status", ["draft", "inviting"])
    .select("id")
    .maybeSingle();
  if (!flipped) return;

  await ensureCohortSessions(cohortId);
  const sessions = await listSessions(cohortId);
  const lines = sessions
    .filter((s) => s.status !== "cancelled")
    .map(sessionLine);

  const emails = await memberEmails(cohortId);
  for (const to of emails) {
    await sendCohortConfirmedEmail({
      to,
      cohortLabel: cohort.label,
      programTitle: programTitle(cohort.programId),
      startDateLabel: fmtDateShort(cohort.startDate),
      sessionLines: lines,
    }).catch((err) =>
      console.error(`Confirmed email to ${to} failed (non-blocking):`, err)
    );
  }
}

// ─── Cancellation + make-ups ──────────────────────────────────────────────────

const REASON_LINES: Record<string, string> = {
  weather: "Weather made the courts unplayable.",
  court: "The court wasn't available.",
  coach: "The coach couldn't make it.",
  other: "A conflict on our side.",
};

export type CancelResult =
  | { ok: true; makeupDate: string | null; overCap: boolean }
  | { ok: false; error: string };

/**
 * Cancel a session: mark it cancelled with the reason, append the make-up row
 * per the Appendix B rules, and email every member. Over the make-up cap no row
 * is appended — the cohort is flagged for credit follow-up instead.
 */
export async function cancelSession(
  sessionId: string,
  reason: "weather" | "court" | "coach" | "other"
): Promise<CancelResult> {
  const supabase = createServiceClient();
  const { data: session } = await supabase
    .from("cohort_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { ok: false, error: "Session not found." };
  const row = session as SessionRow;
  if (row.status === "cancelled") {
    return { ok: false, error: "That session is already cancelled." };
  }

  const cohort = await getCohortById(row.cohort_id);
  if (!cohort) return { ok: false, error: "Cohort not found." };

  const all = await listSessions(row.cohort_id);
  const existing: ExistingSession[] = all.map((s) => ({
    date: s.session_date,
    start: s.start_time,
    status: s.id === row.id ? "cancelled" : s.status,
  }));

  const plan = planMakeup({
    cancelledDate: row.session_date,
    cancelledStart: row.start_time,
    cancelledEnd: row.end_time,
    startDate: cohort.startDate,
    weeks: cohort.weeks,
    makeupMaxWeeks: cohort.makeupMaxWeeks ?? 2,
    slots: cohort.sessions,
    sessions: existing,
  });

  // Guarded flip so a double-tap can't cancel twice / append two make-ups.
  const { data: cancelled } = await supabase
    .from("cohort_sessions")
    .update({ status: "cancelled", cancellation_reason: reason })
    .eq("id", sessionId)
    .neq("status", "cancelled")
    .select("id")
    .maybeSingle();
  if (!cancelled) return { ok: false, error: "That session is already cancelled." };

  let makeupDate: string | null = null;
  if (plan.ok) {
    makeupDate = plan.date;
    await supabase.from("cohort_sessions").upsert(
      [
        {
          cohort_id: row.cohort_id,
          session_date: plan.date,
          start_time: normTime(row.start_time),
          end_time: plan.end,
          status: "scheduled",
          makeup_for: row.id,
        },
      ],
      { onConflict: "cohort_id,session_date,start_time", ignoreDuplicates: true }
    );
  } else {
    await supabase
      .from("cohorts")
      .update({ credit_followup: true })
      .eq("id", row.cohort_id);
  }

  const after = await listSessions(row.cohort_id);
  const newEnd = currentEndDate(
    cohort.startDate,
    cohort.weeks,
    cohort.sessions,
    after.map((s) => ({ date: s.session_date, start: s.start_time, status: s.status }))
  );

  const emails = await memberEmails(row.cohort_id);
  for (const to of emails) {
    await sendSessionCancelledEmail({
      to,
      cohortLabel: cohort.label,
      dateLabel: fmtDateLong(row.session_date),
      reasonLine: REASON_LINES[reason] ?? REASON_LINES.other,
      makeup: makeupDate
        ? { dateLabel: fmtDateLong(makeupDate), newEndDateLabel: fmtDateLong(newEnd) }
        : null,
      makeupMaxWeeks: cohort.makeupMaxWeeks ?? 2,
    }).catch((err) =>
      console.error(`Cancellation email to ${to} failed (non-blocking):`, err)
    );
  }

  return { ok: true, makeupDate, overCap: !plan.ok };
}

// ─── Admin CRUD ───────────────────────────────────────────────────────────────

export type CohortInput = {
  id?: string;
  programId: string;
  label: string;
  levelMin: number | null;
  levelMax: number | null;
  locationLabel: string | null;
  startDate: string;
  weeks: number;
  sessions: { day: string; start: string; end: string }[];
  priceCents: number;
  capacityMin: number;
  capacityMax: number;
  visibility: "public" | "private";
  inviteHoldHours: number;
  makeupMaxWeeks: number;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createCohort(
  input: CohortInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const supabase = createServiceClient();
  const id =
    input.id?.trim() ||
    `${slugify(input.programId)}-${slugify(input.label)}-${input.startDate}`;

  const { error } = await supabase.from("cohorts").insert({
    id,
    program_id: input.programId,
    label: input.label,
    level_min: input.levelMin,
    level_max: input.levelMax,
    location_label: input.locationLabel,
    start_date: input.startDate,
    weeks: input.weeks,
    sessions: input.sessions,
    price_cents: input.priceCents,
    capacity_min: input.capacityMin,
    capacity_max: input.capacityMax,
    visibility: input.visibility,
    status: "draft",
    invite_hold_hours: input.inviteHoldHours,
    makeup_max_weeks: input.makeupMaxWeeks,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, id };
}

export async function updateCohort(
  id: string,
  input: Partial<CohortInput> & { status?: string }
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServiceClient();
  const patch: Record<string, unknown> = {};
  if (input.programId != null) patch.program_id = input.programId;
  if (input.label != null) patch.label = input.label;
  if (input.levelMin !== undefined) patch.level_min = input.levelMin;
  if (input.levelMax !== undefined) patch.level_max = input.levelMax;
  if (input.locationLabel !== undefined) patch.location_label = input.locationLabel;
  if (input.startDate != null) patch.start_date = input.startDate;
  if (input.weeks != null) patch.weeks = input.weeks;
  if (input.sessions != null) patch.sessions = input.sessions;
  if (input.priceCents != null) patch.price_cents = input.priceCents;
  if (input.capacityMin != null) patch.capacity_min = input.capacityMin;
  if (input.capacityMax != null) patch.capacity_max = input.capacityMax;
  if (input.visibility != null) patch.visibility = input.visibility;
  if (input.inviteHoldHours != null) patch.invite_hold_hours = input.inviteHoldHours;
  if (input.makeupMaxWeeks != null) patch.makeup_max_weeks = input.makeupMaxWeeks;
  if (input.status != null) patch.status = input.status;

  const { error } = await supabase.from("cohorts").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
