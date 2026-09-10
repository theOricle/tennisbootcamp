import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { getCohortById } from "@/lib/cohortsDb";
import {
  listInvites,
  listSessions,
  createInvites,
  cancelSession,
  updateCohort,
  ensureCohortSessions,
  memberEmails,
  adminMarkInvitePaid,
  adminMarkInviteUnpaid,
  inviteAmountDueCents,
  type CohortInput,
} from "@/lib/cohortActions";

// Admin cohort detail: invites, sessions, and the state-changing actions —
// invite, cancel_session (→ make-up append), update, set_status, and the
// e-transfer rail's mark_paid / mark_unpaid (backlog #12).

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const cohort = await getCohortById(id);
  if (!cohort || !cohort.dbStatus) {
    return NextResponse.json(
      { error: "Cohort not found in the database (run migration 0004?)." },
      { status: 404 }
    );
  }

  // Seeded cohorts arrive already confirmed — generate their session rows on
  // first open so the cancellation flow has real rows to work on.
  if (["confirmed", "running"].includes(cohort.dbStatus)) {
    await ensureCohortSessions(id);
  }

  const [rawInvites, sessions, members] = await Promise.all([
    listInvites(id),
    listSessions(id),
    memberEmails(id),
  ]);

  // Amount still owed per unpaid invite (price − assessment credit) so the
  // coach can match an e-transfer against it. Paid rows show their record.
  const invites = await Promise.all(
    rawInvites.map(async (i) => ({
      ...i,
      payment_method: i.payment_method ?? null,
      payment_note: i.payment_note ?? null,
      paid_at: i.paid_at ?? null,
      amountDueCents:
        i.status === "paid" ? null : await inviteAmountDueCents(i, cohort),
    }))
  );

  return NextResponse.json({
    cohort,
    invites,
    sessions,
    memberCount: members.length,
    paidCount: invites.filter((i) => i.status === "paid").length,
  });
}

const STATUSES = ["draft", "inviting", "confirmed", "running", "completed", "cancelled"];
const REASONS = ["weather", "court", "coach", "other"] as const;

export async function POST(req: NextRequest, { params }: RouteParams) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  try {
    const body = await req.json();
    const action = String(body.action ?? "");

    if (action === "invite") {
      const emails: string[] = Array.isArray(body.emails)
        ? body.emails.map((e: unknown) => String(e))
        : [];
      if (emails.length === 0) {
        return NextResponse.json({ error: "Add at least one email." }, { status: 400 });
      }
      const result = await createInvites(id, emails);
      if (result.sent === 0 && result.errors.length > 0) {
        return NextResponse.json({ error: result.errors.join(" ") }, { status: 400 });
      }
      // `emailed` can be lower than `sent` — a held spot whose email the
      // provider refused. The admin screen reports both.
      return NextResponse.json({
        ok: true,
        sent: result.sent,
        emailed: result.emailed,
        errors: result.errors,
      });
    }

    if (action === "cancel_session") {
      const sessionId = String(body.sessionId ?? "").trim();
      const reason = String(body.reason ?? "other") as (typeof REASONS)[number];
      if (!sessionId || !REASONS.includes(reason)) {
        return NextResponse.json(
          { error: "Pick the session and a reason." },
          { status: 400 }
        );
      }
      const result = await cancelSession(sessionId, reason);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        makeupDate: result.makeupDate,
        overCap: result.overCap,
      });
    }

    if (action === "set_status") {
      const status = String(body.status ?? "");
      if (!STATUSES.includes(status)) {
        return NextResponse.json({ error: "Unknown status." }, { status: 400 });
      }
      const result = await updateCohort(id, { status });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      if (["confirmed", "running"].includes(status)) {
        await ensureCohortSessions(id);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "mark_paid") {
      const inviteId = String(body.inviteId ?? "").trim();
      if (!inviteId) {
        return NextResponse.json({ error: "Pick the invite." }, { status: 400 });
      }
      const note = body.note == null ? null : String(body.note);
      const result = await adminMarkInvitePaid(id, inviteId, note);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      // The payment is recorded either way; the receipt outcome rides along so
      // the admin sees whether the player was emailed (backlog #15).
      return NextResponse.json({ ok: true, receipt: result.receipt ?? null });
    }

    if (action === "mark_unpaid") {
      const inviteId = String(body.inviteId ?? "").trim();
      if (!inviteId) {
        return NextResponse.json({ error: "Pick the invite." }, { status: 400 });
      }
      const result = await adminMarkInviteUnpaid(id, inviteId);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "update") {
      const patch: Record<string, unknown> = {};
      for (const key of [
        "label",
        "locationLabel",
        "startDate",
        "weeks",
        "priceCents",
        "capacityMin",
        "capacityMax",
        "visibility",
        "inviteHoldHours",
        "makeupMaxWeeks",
        "sessions",
      ]) {
        if (body[key] !== undefined) patch[key] = body[key];
      }
      if (body.levelMin !== undefined) {
        patch.levelMin = body.levelMin === null || body.levelMin === "" ? null : Number(body.levelMin);
      }
      if (body.levelMax !== undefined) {
        patch.levelMax = body.levelMax === null || body.levelMax === "" ? null : Number(body.levelMax);
      }
      if (body.paymentMode !== undefined) {
        if (!["card", "etransfer"].includes(String(body.paymentMode))) {
          return NextResponse.json({ error: "Payment mode is card or etransfer." }, { status: 400 });
        }
        patch.paymentMode = body.paymentMode;
      }

      const result = await updateCohort(id, patch as Partial<CohortInput>);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    console.error("Admin cohort action error:", err);
    return NextResponse.json({ error: "Action failed." }, { status: 500 });
  }
}
