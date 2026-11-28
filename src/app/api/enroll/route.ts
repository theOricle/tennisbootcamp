import { NextRequest, NextResponse, after } from "next/server";
import { google } from "googleapis";
import {
  currentUser,
  resolveSubmissionParticipant,
  settleGuestSubmission,
  type ParticipantInput,
} from "@/lib/household";
import { enrollHolderName, guestPlayer } from "@/lib/guestAccount";
import { getCohortById } from "@/lib/cohortsDb";
import { gateRefusal, requestedParticipantIds, resolveEnrollGate } from "@/lib/enrollGate";
import { enrollmentSheetRow } from "@/lib/sheetText";
import {
  BOT_REFUSAL_ERROR,
  REQUEST_TOO_LARGE,
  bodyTooLarge,
  checkBot,
  logBotDrop,
} from "@/lib/botCheck";
import { tooManyPlayers } from "@/lib/participantInput";
import { SUBMISSION_LIMIT_ERROR } from "@/lib/submissionLimits";
import { checkSubmissionLimit } from "@/lib/submissionLimitsDb";

const TAB = "enrollments";

// Columns 1–16 are frozen (never reorder, rename, or remove).
// Column 17 (assessment_credit) was appended in Phase 3.
// Columns 18–21 were appended 2026-09-08 for household accounts (backlog #11).
// `participant_name` is NOT repeated in that block — it is already column 5 on
// this tab, and a duplicate column in a sheet Sina reads by eye helps nobody.
const HEADERS = [
  "timestamp",
  "cohort_id",
  "program",
  "location",
  "participant_name",
  "participant_dob",
  "is_minor",
  "contact_email",
  "contact_phone",
  "guardian_name",
  "guardian_email",
  "guardian_phone",
  "consent_signed_name",
  "consent_agreed_at",
  "waiver_version",
  "status",
  // ── appended (Phase 3) ──
  "assessment_credit",
  // ── appended (household accounts) ──
  "account_email",
  "account_name",
  "participant_relationship",
  "participant_id",
];

/** A–U: the 16 frozen columns, the credit column, and the household block. */
const APPEND_RANGE = "A:U";

type EnrollParticipant = {
  name?: unknown;
  dob?: unknown;
  isMinor?: unknown;
  participantId?: unknown;
  relationship?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    // The size cap the other public forms have (safety review): one request
    // appends one Sheet row for each player it names, so a body with no cap
    // and no limit on its players could append thousands on one counted try.
    const raw = await req.text();
    if (bodyTooLarge(raw, req.headers.get("content-length"))) {
      return NextResponse.json({ error: REQUEST_TOO_LARGE }, { status: 400 });
    }
    const body = JSON.parse(raw);

    // Bot protection (backlog #84, the same check as the other public forms).
    // A tripped check writes nothing and answers a plain refusal the wizard
    // shows (safety review): a success-shaped answer here walked a real
    // person, wrongly flagged, on to "Your spot is held" with no row saved.
    const verdict = checkBot(body);
    if (verdict.bot) {
      logBotDrop("enroll", verdict.reason);
      return NextResponse.json({ error: BOT_REFUSAL_ERROR }, { status: 400 });
    }
    // No more players than one household holds, the most the wizard can send.
    if (tooManyPlayers(body.participants)) {
      return NextResponse.json({ error: REQUEST_TOO_LARGE }, { status: 400 });
    }

    // Backlog #38: the enroll page's gate, before any row is appended, so a
    // private cohort never collects stray pending rows from a bare POST.
    const cohortId = typeof body.cohortId === "string" ? body.cohortId : "";
    const inviteToken = typeof body.inviteToken === "string" ? body.inviteToken : null;
    // Audit M27: the level of each player the rows are for, not the holder's.
    // A legacy single-player body names its one participant, or nobody.
    const gate = await resolveEnrollGate(await getCohortById(cohortId), inviteToken, {
      payable: true,
      participantIds: Array.isArray(body.participants)
        ? requestedParticipantIds(body.participants)
        : requestedParticipantIds(body.participantId ? [{ participantId: body.participantId }] : []),
    });
    const refused = gateRefusal(gate);
    if (refused) {
      return NextResponse.json({ error: refused.error }, { status: refused.status });
    }

    // Repeated submissions (backlog #84): counted once the gate admits the
    // try (a refused one costs the family nothing), before any row.
    const limitEmail = typeof body?.contactEmail === "string" ? body.contactEmail : null;
    if (!(await checkSubmissionLimit(req, "enroll", limitEmail)).allowed) {
      return NextResponse.json({ error: SUBMISSION_LIMIT_ERROR }, { status: 429 });
    }

    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

    if (!spreadsheetId || !clientEmail || !rawKey) {
      return NextResponse.json(
        { error: "Google Sheets environment variables are not configured." },
        { status: 500 }
      );
    }

    const privateKey = rawKey
      .replace(/\\n/g, "\n")
      .replace(/\r/g, "")
      .trim();

    if (!privateKey.includes("-----BEGIN")) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY does not appear to be a valid PEM key.");
    }

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // Ensure header row exists and is complete
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${TAB}!1:1`,
    });
    const existing = headerRes.data.values?.[0] ?? [];
    const complete = HEADERS.every((h, i) => existing[i] === h);
    if (!complete) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${TAB}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [HEADERS] },
      });
    }

    // One row per player (backlog #11). A legacy body with a single
    // participantName still produces exactly one row, unchanged.
    const incoming: EnrollParticipant[] = Array.isArray(body.participants)
      ? (body.participants as EnrollParticipant[])
      : [
          {
            name: body.participantName,
            dob: body.participantDob,
            isMinor: body.isMinor,
            participantId: body.participantId,
          },
        ];

    const signedIn = await currentUser();
    const holderEmail = signedIn?.email || String(body.contactEmail ?? "").trim();
    const holderName = enrollHolderName(body);

    const timestamp = new Date().toISOString();
    const rows: unknown[][] = [];
    const resolved: {
      name: string;
      participantId: string | null;
      isMinor: boolean;
    }[] = [];

    for (const p of incoming) {
      const who = await resolveSubmissionParticipant({
        signedInUserId: signedIn?.id ?? null,
        participantId: p.participantId,
        participant: {
          name: p.name,
          relationship: p.relationship,
          isMinor: p.isMinor,
        } as ParticipantInput,
        holderName,
        holderEmail,
        holderPhone: body.contactPhone ? String(body.contactPhone) : null,
        defaultName: String(p.name ?? body.participantName ?? "").trim(),
      }).catch(() => null);

      const playerName =
        who?.participantName || String(p.name ?? body.participantName ?? "");
      const isMinor = p.isMinor === true;

      // Every value the request typed is written formula-safe (backlog
      // #33, #84); the columns and their order are unchanged.
      rows.push(
        enrollmentSheetRow({
          timestamp,
          cohortId: body.cohortId,
          program: body.program,
          location: body.location,
          playerName,
          dob: p.dob ?? body.participantDob,
          isMinor,
          contactEmail: body.contactEmail,
          contactPhone: body.contactPhone,
          guardianName: body.guardianName,
          guardianEmail: body.guardianEmail,
          guardianPhone: body.guardianPhone,
          consentSignedName: body.consentSignedName,
          consentAgreedAt: body.consentAgreedAt,
          waiverVersion: body.waiverVersion,
          accountEmail: who?.accountEmail ?? body.contactEmail,
          accountName: who?.accountName ?? holderName,
          relationship: who?.relationship,
          participantId: who?.participantId,
        })
      );
      resolved.push({
        name: playerName,
        participantId: who?.participantId ?? null,
        isMinor,
      });
    }

    const appendRes = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${TAB}!${APPEND_RANGE}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows },
    });

    // Signed out (backlog #84): the rows above are the typed blocks, owned by
    // nobody. After the response, a brand-new address booking someone other
    // than the holder gets its account and those players, as before; an
    // address that already has an account is left exactly as it is, and the
    // answer never says which.
    if (!signedIn && holderEmail) {
      const players = incoming.map((p) =>
        guestPlayer(
          { name: p.name, relationship: p.relationship, isMinor: p.isMinor } as ParticipantInput,
          { name: holderName, defaultName: String(p.name ?? body.participantName ?? "").trim() }
        )
      );
      const holderPhone = body.contactPhone ? String(body.contactPhone) : null;
      after(() =>
        settleGuestSubmission({ email: holderEmail, holderName, holderPhone, players })
      );
    }

    // Parse the appended row numbers from the updated range
    // (e.g. "enrollments!A5:U6" → [5, 6]).
    const updatedRange = appendRes.data.updates?.updatedRange ?? "";
    const bounds = updatedRange.match(/!\D+(\d+):\D+(\d+)$/);
    const first = bounds ? parseInt(bounds[1], 10) : null;
    const last = bounds ? parseInt(bounds[2], 10) : first;
    const rowNumbers: number[] = [];
    if (first != null && last != null) {
      for (let n = first; n <= last; n++) rowNumbers.push(n);
    }

    return NextResponse.json({
      ok: true,
      // Kept for callers that only ever enrolled one person.
      rowNumber: rowNumbers[0] ?? null,
      rowNumbers,
      participants: resolved.map((r, i) => ({
        ...r,
        rowNumber: rowNumbers[i] ?? null,
      })),
    });
  } catch (err) {
    console.error("Enroll API error:", err);
    return NextResponse.json({ error: "Failed to save enrollment." }, { status: 500 });
  }
}
