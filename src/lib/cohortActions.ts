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
import {
  findUserIdByEmail,
  resolveParticipantId,
  getParticipant,
  listPlayers,
  listAccounts,
  type PlayerRecord,
} from "@/lib/players";
import { programs } from "@/content/programs";
import { findUnusedCredit, markCreditApplied } from "@/lib/assessmentCredit";
import { tierRangeForLevels } from "@/lib/tiers";
import {
  sendCohortInviteEmail,
  sendCohortConfirmedEmail,
  sendSessionCancelledEmail,
  sendEtransferInstructionsEmail,
  sendEtransferPendingAdminEmail,
} from "@/lib/email";
import {
  planMarkPaid,
  planMarkUnpaid,
  amountDueCents,
  etransferMemo,
  etransferRecipient,
  PAYABLE_STATUSES,
  type PaymentMethod,
  type CohortPaymentMode,
} from "@/lib/paymentTransitions";
import { setEnrollmentStatusByEmail, setEnrollmentCredit } from "@/lib/enrollmentSheet";

// Server-side cohort operations (Phase 3): invite flow with expiring holds,
// minimum-to-run confirmation, session generation, and cancellation → make-up
// appending per src/lib/makeup.ts. All writes go through the service-role
// client, matching the enrollments/assessments model.

// ─── Row shapes ───────────────────────────────────────────────────────────────

export type InviteRow = {
  id: string;
  cohort_id: string;
  /** The account holder's email — one payer, one inbox, many players. */
  email: string;
  user_id: string | null;
  /** Which player on that account the spot is for (migration 0007). */
  participant_id?: string | null;
  token: string;
  status: "invited" | "paid" | "declined" | "expired";
  invited_at: string;
  expires_at: string;
  // Payment details (migration 0006) — undefined on rows read before it runs.
  payment_method?: PaymentMethod | null;
  payment_note?: string | null;
  paid_at?: string | null;
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

/** Player + account, so the invite list reads "Maya Chen · Dana Chen". */
export type InviteWithHousehold = InviteRow & {
  participant_name: string;
  account_name: string;
};

export async function listInvites(
  cohortId: string
): Promise<InviteWithHousehold[]> {
  await expireStaleInvites(cohortId);
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("cohort_invites")
    .select("*")
    .eq("cohort_id", cohortId)
    .order("invited_at", { ascending: false });
  const rows = (data as InviteRow[]) ?? [];
  if (rows.length === 0) return [];

  const [participants, accounts] = await Promise.all([
    listPlayers().catch(() => [] as PlayerRecord[]),
    listAccounts().catch(() => new Map()),
  ]);
  const byId = new Map(participants.map((p) => [p.id, p]));
  const accountByEmail = new Map<string, string>();
  for (const [id, a] of accounts) {
    if (a.email) accountByEmail.set(a.email.trim().toLowerCase(), id);
  }
  const selfByAccount = new Map<string, PlayerRecord>();
  for (const p of participants) {
    if (p.relationship === "self" && !selfByAccount.has(p.account_id)) {
      selfByAccount.set(p.account_id, p);
    }
  }

  return rows.map((r) => {
    const accountId =
      byId.get(r.participant_id ?? "")?.account_id ??
      r.user_id ??
      accountByEmail.get(r.email.trim().toLowerCase()) ??
      null;
    const participant =
      byId.get(r.participant_id ?? "") ??
      (accountId ? selfByAccount.get(accountId) : undefined);
    const account = accountId ? accounts.get(accountId) : undefined;
    return {
      ...r,
      participant_name: participant?.full_name?.trim() || r.email,
      account_name: account?.name?.trim() || r.email,
    };
  });
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
  emails: string[],
  /**
   * Optional player per email, positionally matched. Without it an invite goes
   * to the account holder — the pre-household behaviour.
   */
  participantIds?: (string | null)[]
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

  const participantByEmail = new Map<string, string>();
  emails.forEach((raw, i) => {
    const id = participantIds?.[i];
    if (id) participantByEmail.set(raw.trim().toLowerCase(), id);
  });

  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (raw.trim()) errors.push(`"${raw.trim()}" doesn't look like an email.`);
      continue;
    }

    const token = newToken();
    const expiresAt = new Date(Date.now() + holdHours * 3600 * 1000).toISOString();
    const userId = await findUserIdByEmail(email);

    // Which player on that account the spot is for. An email-only invite goes
    // to the holder themselves; `participantIds` names someone else.
    const participantId =
      participantByEmail.get(email) ??
      (await resolveParticipantId({ accountId: userId, email }).catch(() => null));
    const participant = participantId
      ? await getParticipant(participantId).catch(() => null)
      : null;

    const inviteRow: Record<string, unknown> = {
      cohort_id: cohortId,
      email,
      user_id: userId,
      token,
      status: "invited",
      expires_at: expiresAt,
    };
    if (participantId) inviteRow.participant_id = participantId;

    let { error } = await supabase.from("cohort_invites").insert(inviteRow);
    if (error && /participant_id/i.test(error.message)) {
      // Migration 0007 hasn't been pasted yet — invite on the email alone.
      delete inviteRow.participant_id;
      ({ error } = await supabase.from("cohort_invites").insert(inviteRow));
    }
    if (error) {
      errors.push(`${email}: ${error.message}`);
      continue;
    }

    const credit = await findUnusedCredit(email, { participantId });
    const enrollUrl = `${siteUrl()}/enroll/${cohortId}?invite=${token}`;
    await sendCohortInviteEmail({
      to: email,
      participantName: participant?.full_name ?? null,
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

/** One entry per player in the cohort: who is in, and whose inbox to use. */
export type CohortMember = { email: string; participantName: string | null };

/**
 * Members: paid invites plus paid/test-paid enrollments. One entry per player,
 * so a parent with two children in the same cohort gets one email per child.
 * De-duplicated on (email, player) — the same person from both sources is one
 * member.
 */
export async function cohortMembers(cohortId: string): Promise<CohortMember[]> {
  const supabase = createServiceClient();
  const [{ data: invites }, { data: enrollments }] = await Promise.all([
    supabase
      .from("cohort_invites")
      .select("email, participant_id")
      .eq("cohort_id", cohortId)
      .eq("status", "paid"),
    supabase
      .from("enrollments")
      .select("contact_email, participant_name")
      .eq("cohort_id", cohortId)
      .in("status", ["paid", "test_paid"]),
  ]);

  const participants = await listPlayers().catch(() => [] as PlayerRecord[]);
  const byId = new Map(participants.map((p) => [p.id, p]));

  const seen = new Set<string>();
  const out: CohortMember[] = [];
  const add = (email: string | null | undefined, name: string | null) => {
    const e = email?.trim().toLowerCase();
    if (!e) return;
    const key = `${e}|${(name ?? "").trim().toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ email: e, participantName: name?.trim() || null });
  };

  for (const r of invites ?? []) {
    const row = r as { email: string; participant_id?: string | null };
    add(row.email, byId.get(row.participant_id ?? "")?.full_name ?? null);
  }
  for (const r of enrollments ?? []) {
    const row = r as { contact_email: string | null; participant_name: string | null };
    add(row.contact_email, row.participant_name);
  }
  return out;
}

/** Distinct member emails (one per inbox, players collapsed). */
export async function memberEmails(cohortId: string): Promise<string[]> {
  return [...new Set((await cohortMembers(cohortId)).map((m) => m.email))];
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

type InviteRef = Pick<
  InviteRow,
  "id" | "email" | "status" | "expires_at" | "payment_method" | "participant_id"
>;

async function findInviteById(cohortId: string, inviteId: string): Promise<InviteRef | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("cohort_invites")
    .select("*")
    .eq("id", inviteId)
    .eq("cohort_id", cohortId)
    .maybeSingle();
  return (data as InviteRef | null) ?? null;
}

/**
 * Mark the invite paid and confirm the cohort once paid invites reach
 * capacity_min: status → confirmed, sessions generated, confirmed email to
 * every member. The invite is found by id (admin mark-paid), else by token
 * (Stripe webhook / mock checkout), else the newest live invite for the email.
 *
 * `invited` and `expired` both flip to `paid` — paying inside checkout, or an
 * e-transfer landing late, honors a hold that lapsed in the meantime. The
 * transition table lives in src/lib/paymentTransitions.ts.
 *
 * Payment details (payment_method / payment_note / paid_at, migration 0006)
 * are written in a second, best-effort update so the card path keeps working
 * on a database that hasn't run 0006 yet.
 */
export async function markInvitePaidAndMaybeConfirm(params: {
  cohortId: string;
  email?: string;
  inviteToken?: string;
  inviteId?: string;
  /** Narrows the email lookup when one account holds several invites. */
  participantId?: string;
  payment?: { method: PaymentMethod; note?: string | null };
}): Promise<{ ok: boolean; error?: string }> {
  const { cohortId, email, inviteToken, inviteId, participantId, payment } = params;
  const supabase = createServiceClient();

  let target: InviteRef | null = null;
  if (inviteId) {
    target = await findInviteById(cohortId, inviteId);
    if (!target) return { ok: false, error: "Invite not found." };
  } else if (inviteToken) {
    const { data } = await supabase
      .from("cohort_invites")
      .select("*")
      .eq("token", inviteToken)
      .eq("cohort_id", cohortId)
      .maybeSingle();
    target = (data as InviteRef | null) ?? null;
  } else if (email) {
    // With several players on one account the email alone is ambiguous, so
    // the participant narrows it. Falling back to the newest live invite
    // keeps every pre-household caller working.
    const byParticipant = participantId
      ? await supabase
          .from("cohort_invites")
          .select("*")
          .eq("cohort_id", cohortId)
          .eq("participant_id", participantId)
          .in("status", PAYABLE_STATUSES)
          .order("invited_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : null;
    if (byParticipant?.data) {
      target = byParticipant.data as InviteRef;
    } else {
      const { data } = await supabase
        .from("cohort_invites")
        .select("*")
        .eq("cohort_id", cohortId)
        .ilike("email", email.trim())
        .in("status", PAYABLE_STATUSES)
        .order("invited_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      target = (data as InviteRef | null) ?? null;
    }
  }

  if (target) {
    const plan = planMarkPaid(target, {
      method: payment?.method ?? "card",
      note: payment?.note,
      now: new Date(),
    });
    if (!plan.ok) {
      // Admin double-tap (or a paid invite re-hit by a duplicate webhook):
      // surface it to the admin, stay silent for the payment rails.
      if (inviteId) return { ok: false, error: plan.error };
    } else {
      const { status, ...details } = plan.patch;
      const { data: flipped } = await supabase
        .from("cohort_invites")
        .update({ status })
        .eq("id", target.id)
        .in("status", PAYABLE_STATUSES)
        .select("id")
        .maybeSingle();
      if (!flipped) {
        if (inviteId) {
          return { ok: false, error: "That invite changed state — refresh and try again." };
        }
      } else {
        const { error } = await supabase
          .from("cohort_invites")
          .update(details)
          .eq("id", target.id);
        if (error) {
          console.warn(
            "Invite payment details not recorded (run migration 0006?):",
            error.message
          );
        }
      }
    }
  }

  await maybeConfirmCohort(cohortId);
  return { ok: true };
}

// ─── E-transfer rail (backlog #12) ────────────────────────────────────────────
// Cohorts with payment_mode = 'etransfer' collect money outside Stripe: the
// enroll wizard shows Interac instructions, the player taps "I've sent it"
// (recordEtransferIntent), and the coach marks the invite paid in the admin
// (adminMarkInvitePaid) — which reuses markInvitePaidAndMaybeConfirm so the
// minimum-to-run confirmation and its email behave exactly as after a card
// payment. Card checkout stays available on every cohort.

/** The invite's price after the assessment credit (for admin display). */
export async function inviteAmountDueCents(
  invite: Pick<InviteRow, "email" | "participant_id">,
  cohort: Cohort
): Promise<number> {
  const credit = await findUnusedCredit(invite.email, {
    participantId: invite.participant_id ?? null,
  });
  return amountDueCents(cohort.priceCents, credit?.creditCents ?? 0);
}

/**
 * Coach confirms an e-transfer arrived: invite → paid (with method, note,
 * paid_at), the enrollee's assessment credit is consumed, and the enrollment
 * row (Supabase + Sheet) flips to paid so seat counts and the dashboard agree.
 * Then the same confirmation path as a card payment.
 */
export async function adminMarkInvitePaid(
  cohortId: string,
  inviteId: string,
  note?: string | null
): Promise<{ ok: boolean; error?: string }> {
  const invite = await findInviteById(cohortId, inviteId);
  if (!invite) return { ok: false, error: "Invite not found." };

  const result = await markInvitePaidAndMaybeConfirm({
    cohortId,
    inviteId,
    payment: { method: "etransfer", note },
  });
  if (!result.ok) return result;

  await settleEtransferEnrollment(cohortId, invite.email, invite.participant_id).catch((err) =>
    console.error("E-transfer settlement bookkeeping failed (non-blocking):", err)
  );
  return { ok: true };
}

async function settleEtransferEnrollment(
  cohortId: string,
  email: string,
  participantId?: string | null
): Promise<void> {
  const credit = await findUnusedCredit(email, { participantId });
  if (credit) await markCreditApplied(credit.bookingId);

  const supabase = createServiceClient();
  await supabase
    .from("enrollments")
    .update({ status: "paid" })
    .eq("cohort_id", cohortId)
    .ilike("contact_email", email.trim())
    .eq("status", "pending");

  const rows = await setEnrollmentStatusByEmail({
    cohortId,
    email,
    from: ["pending", "pending_etransfer"],
    to: "paid",
  });
  if (credit) {
    for (const rowNumber of rows) {
      await setEnrollmentCredit(rowNumber, (credit.creditCents / 100).toFixed(2));
    }
  }
}

/**
 * Reverse a paid mark without deleting the invite (mis-tap, bounced
 * transfer). The cohort's confirmed status is not rolled back — that's a
 * one-way event whose emails have already gone out — so the paid count can
 * temporarily sit under capacity_min on a confirmed cohort. E-transfer
 * enrollments drop back to pending; a card-paid enrollment is left alone.
 * An assessment credit consumed by mark-paid is not restored here.
 */
export async function adminMarkInviteUnpaid(
  cohortId: string,
  inviteId: string
): Promise<{ ok: boolean; error?: string }> {
  const invite = await findInviteById(cohortId, inviteId);
  if (!invite) return { ok: false, error: "Invite not found." };

  const plan = planMarkUnpaid(invite, new Date());
  if (!plan.ok) return { ok: false, error: plan.error };

  const supabase = createServiceClient();
  const { data: flipped, error } = await supabase
    .from("cohort_invites")
    .update(plan.patch)
    .eq("id", inviteId)
    .eq("status", "paid")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!flipped) return { ok: false, error: "That invite changed state — refresh and try again." };

  if (invite.payment_method === "etransfer") {
    await supabase
      .from("enrollments")
      .update({ status: "pending" })
      .eq("cohort_id", cohortId)
      .ilike("contact_email", invite.email.trim())
      .eq("status", "paid");
    await setEnrollmentStatusByEmail({
      cohortId,
      email: invite.email,
      from: ["paid"],
      to: "pending_etransfer",
    });
  }
  return { ok: true };
}

export type EtransferIntentResult =
  | {
      ok: true;
      amountCents: number;
      creditCents: number;
      recipientEmail: string;
      memo: string;
      alreadyPaid: boolean;
    }
  | { ok: false; error: string; status: number };

/**
 * Player taps "I've sent it" on an e-transfer cohort. Records
 * payment_method = 'etransfer' on their invite (status stays `invited` —
 * awaiting the coach's confirmation), emails them the amount / recipient /
 * memo with the hold line, and pings the inbox so the coach knows to look.
 * A player admitted without a token (public cohort, or a tier-gated private
 * one) gets an invite row created here so the coach has something to mark.
 */
export async function recordEtransferIntent(params: {
  cohortId: string;
  /** The account holder's email — one payer. */
  contactEmail: string;
  /** The player this spot is for. */
  participantName: string;
  participantId?: string | null;
  inviteToken?: string | null;
}): Promise<EtransferIntentResult> {
  const { cohortId, inviteToken } = params;
  const email = params.contactEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email.", status: 400 };
  }

  const cohort = await getCohortById(cohortId);
  if (!cohort || !cohort.dbStatus) {
    return { ok: false, error: "Cohort not found.", status: 404 };
  }
  if ((cohort.paymentMode ?? "card") !== "etransfer") {
    return { ok: false, error: "This cohort is paid by card.", status: 400 };
  }

  const supabase = createServiceClient();

  // Resolve the invite: token first, then the newest live invite for the
  // email, else create one so the admin has a row to mark paid.
  let invite: InviteRef | null = null;
  if (inviteToken) {
    const { data } = await supabase
      .from("cohort_invites")
      .select("*")
      .eq("token", inviteToken)
      .eq("cohort_id", cohortId)
      .maybeSingle();
    invite = (data as InviteRef | null) ?? null;
  }
  if (!invite && params.participantId) {
    // Several players on one account: match this player's own invite first.
    const { data } = await supabase
      .from("cohort_invites")
      .select("*")
      .eq("cohort_id", cohortId)
      .eq("participant_id", params.participantId)
      .in("status", ["invited", "paid"])
      .order("invited_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    invite = (data as InviteRef | null) ?? null;
  }
  if (!invite && !params.participantId) {
    const { data } = await supabase
      .from("cohort_invites")
      .select("*")
      .eq("cohort_id", cohortId)
      .ilike("email", email)
      .in("status", ["invited", "paid"])
      .order("invited_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    invite = (data as InviteRef | null) ?? null;
  }
  if (!invite) {
    const holdHours = cohort.inviteHoldHours ?? 48;
    const row: Record<string, unknown> = {
      cohort_id: cohortId,
      email,
      user_id: await findUserIdByEmail(email),
      token: newToken(),
      status: "invited",
      expires_at: new Date(Date.now() + holdHours * 3600 * 1000).toISOString(),
    };
    if (params.participantId) row.participant_id = params.participantId;
    let { data, error } = await supabase
      .from("cohort_invites")
      .insert(row)
      .select("*")
      .single();
    if (error && /participant_id/i.test(error.message)) {
      delete row.participant_id;
      ({ data, error } = await supabase
        .from("cohort_invites")
        .insert(row)
        .select("*")
        .single());
    }
    if (error || !data) {
      return { ok: false, error: "Couldn't hold your spot — please try again.", status: 500 };
    }
    invite = data as InviteRef;
  }

  const credit = await findUnusedCredit(email, {
    participantId: params.participantId ?? invite.participant_id ?? null,
  });
  const creditCents = Math.min(credit?.creditCents ?? 0, cohort.priceCents);
  const amountCents = amountDueCents(cohort.priceCents, creditCents);
  const recipientEmail = etransferRecipient();
  const memo = etransferMemo(params.participantName, cohort.label);

  if (invite.status === "paid") {
    return { ok: true, amountCents, creditCents, recipientEmail, memo, alreadyPaid: true };
  }

  const { error } = await supabase
    .from("cohort_invites")
    .update({ payment_method: "etransfer" })
    .eq("id", invite.id);
  if (error) {
    console.error("recordEtransferIntent update failed (run migration 0006?):", error.message);
    return {
      ok: false,
      error: "Couldn't record your e-transfer — please email info@tennisbootcamp.ca.",
      status: 500,
    };
  }

  const firstName = params.participantName.trim().split(/\s+/)[0] || "";
  const cardUrl = inviteToken
    ? `${siteUrl()}/enroll/${cohortId}?invite=${inviteToken}`
    : `${siteUrl()}/enroll/${cohortId}`;
  await sendEtransferInstructionsEmail({
    to: email,
    firstName,
    programTitle: programTitle(cohort.programId),
    cohortLabel: cohort.label,
    priceCents: cohort.priceCents,
    creditCents,
    amountCents,
    recipientEmail,
    memo,
    cardUrl,
  }).catch((err) =>
    console.error(`E-transfer instructions email to ${email} failed (non-blocking):`, err)
  );
  await sendEtransferPendingAdminEmail({
    playerName: params.participantName,
    playerEmail: email,
    cohortLabel: cohort.label,
    cohortId,
    amountCents,
    memo,
  }).catch((err) =>
    console.error("E-transfer admin notification failed (non-blocking):", err)
  );

  return { ok: true, amountCents, creditCents, recipientEmail, memo, alreadyPaid: false };
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

  const members = await cohortMembers(cohortId);
  for (const member of members) {
    await sendCohortConfirmedEmail({
      to: member.email,
      participantName: member.participantName,
      cohortLabel: cohort.label,
      programTitle: programTitle(cohort.programId),
      startDateLabel: fmtDateShort(cohort.startDate),
      sessionLines: lines,
    }).catch((err) =>
      console.error(`Confirmed email to ${member.email} failed (non-blocking):`, err)
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
  paymentMode?: CohortPaymentMode; // default card
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
    // Only sent when non-default so creating cohorts keeps working before
    // migration 0006 adds the column.
    ...(input.paymentMode === "etransfer" ? { payment_mode: "etransfer" } : {}),
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
  if (input.paymentMode != null) patch.payment_mode = input.paymentMode;
  if (input.status != null) patch.status = input.status;


  const { error } = await supabase.from("cohorts").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
