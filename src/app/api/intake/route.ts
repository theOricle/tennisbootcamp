import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { subscribeToMailerLite } from "@/lib/mailerlite";
import { recommendPrograms } from "@/lib/recommend";
import { sendRecommendationEmail } from "@/lib/email";
import { tentativeLevelLabel } from "@/lib/level";
import { isAgeBand } from "@/lib/ageBand";
import {
  INTAKE_ALL_HEADERS,
  INTAKE_APPEND_RANGE_ALL,
  buildIntakeRow,
  intakeAvailabilitySlots,
} from "@/lib/intakeRow";
import { provisionIntakeAccount } from "@/lib/intakeAccount";
import {
  currentUser,
  resolveSubmissionParticipants,
  type ParticipantInput,
} from "@/lib/household";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const tabName = process.env.GOOGLE_SHEETS_TAB_NAME ?? "Sheet1";

    const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    if (!spreadsheetId || !clientEmail || !rawKey) {
      return NextResponse.json(
        { error: "Google Sheets environment variables are not configured." },
        { status: 500 }
      );
    }

    // Normalize the private key: handle \\n literals, \r characters, and surrounding whitespace
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

    // Ensure header row exists and is complete before appending data.
    // Columns 1–17 are frozen; 18–22 are the appended household block.
    // See src/lib/intakeRow.ts.
    const HEADERS = [...INTAKE_ALL_HEADERS];

    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!1:1`,
    });

    const existingHeaders = headerRes.data.values?.[0] ?? [];
    const headersComplete = HEADERS.every((h, i) => existingHeaders[i] === h);

    if (!headersComplete) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabName}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [HEADERS] },
      });
    }

    // Legacy slot list for the rule-based recommender (unchanged engine).
    const availabilitySlots = intakeAvailabilitySlots(body);

    // Who is the quiz about? (backlog #11) A parent can answer for two
    // children at once; each becomes its own row, sharing one account email.
    // A submission that names nobody resolves to a single self player — the
    // pre-household behaviour, byte for byte.
    const holderEmail = typeof body.email === "string" ? body.email.trim() : "";
    const holderName = typeof body.name === "string" ? body.name.trim() : "";
    const holderPhone = typeof body.phone === "string" ? body.phone.trim() : null;

    const signedIn = await currentUser();
    const people = holderEmail
      ? await resolveSubmissionParticipants({
          signedInUserId: signedIn?.id ?? null,
          participantIds: body.participantIds,
          participants: (body.participants ?? null) as ParticipantInput[] | null,
          participantProfiles: body.participantProfiles,
          holderName,
          holderEmail: signedIn?.email || holderEmail,
          holderPhone,
        }).catch((err) => {
          console.error("Participant resolution failed (non-blocking):", err);
          return [];
        })
      : [];

    // One row per player. Cells 1–17 are the frozen contract, unchanged in
    // shape and order; cols 2, 5 and 6 (name, who, level) describe the row's
    // own player now that the quiz asks age and level per person (backlog
    // #14). A player who named no age band falls back to the submission's
    // values — for a lone player that is byte for byte what it always was.
    // (An older client that sends neither lands on the fallback for every row,
    // exactly as it did before this change.)
    const timestamp = new Date().toISOString();
    const rows =
      people.length > 0
        ? people.map((p) =>
            buildIntakeRow(
              {
                ...body,
                name: p.participantName || body.name,
                who: p.legacyWho ?? body.who,
                level: p.legacyLevel ?? body.level,
              },
              timestamp,
              {
                accountEmail: p.accountEmail || holderEmail,
                accountName: p.accountName || holderName,
                participantName: p.participantName,
                participantRelationship: p.relationship,
                participantId: p.participantId,
              }
            )
          )
        : [buildIntakeRow(body, timestamp, {})];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tabName}!${INTAKE_APPEND_RANGE_ALL}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows },
    });

    // Account + availability (backlog #13). Runs only after the Sheet append
    // succeeded, only when Supabase is configured, and can never fail the
    // intake response — provisionIntakeAccount logs and swallows everything.
    // The grid is written to every player the quiz was about.
    if (holderEmail) {
      await provisionIntakeAccount({
        email: holderEmail,
        name: holderName || null,
        phone: holderPhone,
        availability: body.availability,
        participantIds: people
          .map((p) => p.participantId)
          .filter((id): id is string => Boolean(id)),
        forceInvite: people.some((p) => p.accountCreated),
      });
    }

    if (body.newsletter === true) {
      await subscribeToMailerLite(body.email ?? "", body.name);
    }

    // Fire-and-forget recommendation email — never block the response.
    if (process.env.RESEND_API_KEY && body.email) {
      const recs = recommendPrograms({
        who: body.who,
        // Age band of the player the email is about (the first one named), so
        // it reaches the same program the result screen showed.
        ageBand: isAgeBand(body.ageBand) ? body.ageBand : undefined,
        level: body.level,
        goals: Array.isArray(body.goals) ? body.goals : [],
        programs: Array.isArray(body.programs) ? body.programs : [],
        preferredLocationIds: Array.isArray(body.preferredLocationIds) ? body.preferredLocationIds : [],
        availability: availabilitySlots,
      });
      if (recs.length > 0) {
        const tentativeLevel = tentativeLevelLabel(body.level);
        sendRecommendationEmail(body.email, body.name ?? "", recs, tentativeLevel).catch(
          (err) => {
            console.error("Recommendation email failed (non-blocking):", err);
          }
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Intake API error:", err);
    return NextResponse.json({ error: "Failed to submit intake." }, { status: 500 });
  }
}
