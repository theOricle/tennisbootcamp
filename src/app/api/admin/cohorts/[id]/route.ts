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
  type CohortInput,
} from "@/lib/cohortActions";

// Admin cohort detail: invites, sessions, and the state-changing actions —
// invite, cancel_session (→ make-up append), update, set_status.

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

  const [invites, sessions, members] = await Promise.all([
    listInvites(id),
    listSessions(id),
    memberEmails(id),
  ]);

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
      return NextResponse.json({ ok: true, sent: result.sent, errors: result.errors });
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
