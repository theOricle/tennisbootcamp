import "server-only";
import type { AdminUser } from "@/lib/adminAuth";
import { createServiceClient } from "@/lib/supabase/service";
import { mapRowToCohort, type CohortRow } from "@/lib/cohortsDb";
import { inviteAmountDueCents, type InviteRow } from "@/lib/cohortActions";
import { todayIso } from "@/lib/cohortVisibility";
import { addDaysISO } from "@/lib/makeup";
import {
  LIVE_COHORT_STATUSES,
  deskFrom,
  holdEndsToday,
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
// Each read asks only for what can wait, so its size follows the work in
// hand and not the history: cohorts that can still take a payment, their
// unpaid e-transfers and the holds that end within a day, open requests, and
// the bookings in today's and tomorrow's assessment blocks. Each read also
// asks the database how many rows match (`count: "exact"`): an error, or
// fewer rows returned than match (the API's row cap), makes that side read
// as "couldn't check". The desk never shows a count it could not read whole.
//
// What a waiting e-transfer owes is not worked out here: it is
// inviteAmountDueCents, the function the cohort's page shows the amount
// with, asked only for the invites the desk shows.

type DeskInviteRow = Pick<
  InviteRow,
  "id" | "cohort_id" | "email" | "user_id" | "participant_id" | "status" | "payment_method" | "expires_at"
>;

const INVITE_COLUMNS = "id, cohort_id, email, user_id, participant_id, status, payment_method, expires_at";

/** The answer of one read, as the Supabase client gives it. */
type Answer = { data: unknown[] | null; error: unknown; count?: number | null };

/** The slice of the Supabase client these reads use; a test hands in a stand-in. */
export type DeskClient = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

function configured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** A read's rows, or null when it failed or came back cut short of the rows that match. */
export function wholeRows<T>(answer: Answer): T[] | null {
  if (answer.error || !Array.isArray(answer.data)) return null;
  if (typeof answer.count !== "number" || answer.count > answer.data.length) return null;
  return answer.data as T[];
}

const COUNTED = { count: "exact" as const };

async function readCohortSide(client: DeskClient, now: Date): Promise<DeskRead<CohortSide>> {
  try {
    const cohortRows = wholeRows<CohortRow>(
      await client.from("cohorts").select("*", COUNTED).in("status", [...LIVE_COHORT_STATUSES])
    );
    if (!cohortRows) return { ok: false };
    const cohorts = cohortRows.map(mapRowToCohort);
    const ids = cohorts.map((c) => c.id);
    if (ids.length === 0) return { ok: true, data: { cohorts, invites: [], amountDueCents: new Map() } };

    // A hold that ends today in Toronto ends within the next day; 26 hours
    // covers the 25-hour day when the clocks go back. holdEndsToday decides.
    const dayAhead = new Date(now.getTime() + 26 * 60 * 60 * 1000).toISOString();
    const [transferRead, holdRead] = await Promise.all([
      client
        .from("cohort_invites")
        .select(INVITE_COLUMNS, COUNTED)
        .in("cohort_id", ids)
        .in("status", ["invited", "expired"])
        .eq("payment_method", "etransfer"),
      client
        .from("cohort_invites")
        .select(INVITE_COLUMNS, COUNTED)
        .in("cohort_id", ids)
        .eq("status", "invited")
        .gt("expires_at", now.toISOString())
        .lte("expires_at", dayAhead),
    ]);
    const transfers = wholeRows<DeskInviteRow>(transferRead);
    const holds = wholeRows<DeskInviteRow>(holdRead);
    if (!transfers || !holds) return { ok: false };

    // One row per invite: an e-transfer whose hold also ends today is in both reads.
    const byInvite = new Map<string, DeskInviteRow>();
    for (const row of [...transfers, ...holds]) byInvite.set(row.id, row);
    const invites = [...byInvite.values()].filter((i) => transferIsWaiting(i) || holdEndsToday(deskInvite(i), now));

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

    return { ok: true, data: { cohorts, invites: invites.map(deskInvite), amountDueCents } };
  } catch {
    return { ok: false };
  }
}

function deskInvite(row: DeskInviteRow) {
  return {
    id: row.id,
    cohort_id: row.cohort_id,
    status: row.status,
    payment_method: row.payment_method ?? null,
    expires_at: row.expires_at,
  };
}

async function readAssessmentSide(client: DeskClient, now: Date): Promise<DeskRead<DeskBooking[]>> {
  try {
    const today = todayIso(now);
    const [requestRead, blockRead] = await Promise.all([
      // Open requests: no time yet. A test booking is status "test" and is never read.
      client.from("assessment_bookings").select("id, status", COUNTED).eq("status", "requested"),
      client
        .from("assessment_blocks")
        .select("id, block_date", COUNTED)
        .gte("block_date", today)
        .lte("block_date", addDaysISO(today, 1)),
    ]);
    const requests = wholeRows<{ id: string; status: string }>(requestRead);
    const blocks = wholeRows<{ id: string; block_date: string }>(blockRead);
    if (!requests || !blocks) return { ok: false };

    let booked: { id: string; status: string; block_id: string | null }[] = [];
    if (blocks.length > 0) {
      const rows = wholeRows<{ id: string; status: string; block_id: string | null }>(
        await client
          .from("assessment_bookings")
          .select("id, status, block_id", COUNTED)
          .eq("status", "booked")
          .in(
            "block_id",
            blocks.map((b) => b.id)
          )
      );
      if (!rows) return { ok: false };
      booked = rows;
    }

    const dateByBlock = new Map(blocks.map((b) => [b.id, b.block_date]));
    return {
      ok: true,
      data: [
        ...requests.map((r) => ({ id: r.id, status: r.status, block_date: null })),
        ...booked.map((r) => ({ id: r.id, status: r.status, block_date: dateByBlock.get(r.block_id ?? "") ?? null })),
      ],
    };
  } catch {
    return { ok: false };
  }
}

/**
 * What waits on the coach, read for the admin the gate returned. With no
 * database configured both sides read as "couldn't check". `client` is the
 * service-role client; a test hands in a stand-in.
 */
export async function readAdminDesk(admin: AdminUser, now: Date = new Date(), client?: DeskClient): Promise<Desk> {
  if (!admin?.id || (!client && !configured())) {
    return deskFrom({ now, cohorts: { ok: false }, assessments: { ok: false } });
  }
  const db = client ?? createServiceClient();
  const [cohorts, assessments] = await Promise.all([readCohortSide(db, now), readAssessmentSide(db, now)]);
  return deskFrom({ now, cohorts, assessments });
}
