import "server-only";
import type { AdminUser } from "@/lib/adminAuth";
import { createServiceClient } from "@/lib/supabase/service";
import { mapRowToCohort, type CohortRow } from "@/lib/cohortsDb";
import { inviteAmountDueCents, type InviteRow } from "@/lib/cohortActions";
import { todayIso } from "@/lib/cohortVisibility";
import { addDaysISO } from "@/lib/makeup";
import {
  deskFrom,
  transferIsWaiting,
  type CohortSide,
  type Desk,
  type DeskBooking,
  type DeskRead,
} from "@/lib/adminDesk";

// The reads behind "Waiting on you" on /admin (backlog #104). Service-role
// reads, so server-only, and they take the admin the page's gate returned:
// there is no way to call them without one. Read-only: nothing is written,
// expired or emailed from here.
//
// Each side checks its own error, because the desk must be able to say "I
// couldn't check" (the list helpers the admin pages use answer a failed read
// with an empty list). What each waiting e-transfer owes is not worked out
// here: it is inviteAmountDueCents, the function the cohort's page shows the
// amount with.

type DeskInviteRow = Pick<
  InviteRow,
  "id" | "cohort_id" | "email" | "user_id" | "participant_id" | "status" | "payment_method" | "expires_at"
>;

function configured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function readCohortSide(): Promise<DeskRead<CohortSide>> {
  try {
    const supabase = createServiceClient();
    const [cohortRead, inviteRead] = await Promise.all([
      supabase.from("cohorts").select("*").order("start_date", { ascending: true }),
      supabase
        .from("cohort_invites")
        .select("id, cohort_id, email, user_id, participant_id, status, payment_method, expires_at")
        .in("status", ["invited", "expired"]),
    ]);
    if (cohortRead.error || inviteRead.error) return { ok: false };

    const cohorts = ((cohortRead.data as CohortRow[] | null) ?? []).map(mapRowToCohort);
    const invites = (inviteRead.data as DeskInviteRow[] | null) ?? [];
    const byId = new Map(cohorts.map((c) => [c.id, c]));

    const amountDueCents = new Map<string, number | null>();
    await Promise.all(
      invites.filter(transferIsWaiting).map(async (invite) => {
        const cohort = byId.get(invite.cohort_id);
        if (!cohort) return;
        try {
          amountDueCents.set(invite.id, await inviteAmountDueCents(invite, cohort));
        } catch {
          amountDueCents.set(invite.id, null);
        }
      })
    );

    return {
      ok: true,
      data: {
        cohorts,
        invites: invites.map((i) => ({
          id: i.id,
          cohort_id: i.cohort_id,
          status: i.status,
          payment_method: i.payment_method ?? null,
          expires_at: i.expires_at,
        })),
        amountDueCents,
      },
    };
  } catch {
    return { ok: false };
  }
}

async function readAssessmentSide(now: Date): Promise<DeskRead<DeskBooking[]>> {
  try {
    const supabase = createServiceClient();
    const today = todayIso(now);
    const [bookingRead, blockRead] = await Promise.all([
      // Requests with no time, and bookings with one. A test booking is
      // status "test" and is never read.
      supabase.from("assessment_bookings").select("id, status, block_id").in("status", ["requested", "booked"]),
      supabase
        .from("assessment_blocks")
        .select("id, block_date")
        .gte("block_date", today)
        .lte("block_date", addDaysISO(today, 1)),
    ]);
    if (bookingRead.error || blockRead.error) return { ok: false };

    const dateByBlock = new Map(
      ((blockRead.data as { id: string; block_date: string }[] | null) ?? []).map((b) => [b.id, b.block_date])
    );
    const rows = (bookingRead.data as { id: string; status: string; block_id: string | null }[] | null) ?? [];
    return {
      ok: true,
      data: rows.map((r) => ({ id: r.id, status: r.status, block_date: dateByBlock.get(r.block_id ?? "") ?? null })),
    };
  } catch {
    return { ok: false };
  }
}

/**
 * What waits on the coach, read for the admin the gate returned. With no
 * database configured both sides read as "couldn't check".
 */
export async function readAdminDesk(admin: AdminUser, now: Date = new Date()): Promise<Desk> {
  if (!admin?.id || !configured()) {
    return deskFrom({ now, cohorts: { ok: false }, assessments: { ok: false } });
  }
  const [cohorts, assessments] = await Promise.all([readCohortSide(), readAssessmentSide(now)]);
  return deskFrom({ now, cohorts, assessments });
}
