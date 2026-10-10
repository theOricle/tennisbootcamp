import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { subscribeToMailerLite } from "@/lib/mailerlite";
import { recommendPrograms } from "@/lib/recommend";
import { sendRecommendationEmail } from "@/lib/email";
import { provisionalTierFor } from "@/lib/level";
import { isAgeBand } from "@/lib/ageBand";
import {
  INTAKE_APPEND_RANGE_ALL,
  buildIntakeRow,
  intakeAvailabilitySlots,
  intakeHeaderPatch,
} from "@/lib/intakeRow";
import { provisionIntakeAccount } from "@/lib/intakeAccount";
import { bodyTooLarge, logBotDrop, REQUEST_TOO_LARGE } from "@/lib/botCheck";
import { decideIntake } from "@/lib/intakeGuard";
import {
  currentUser,
  resolveSubmissionParticipants,
  type ParticipantInput,
} from "@/lib/household";

export async function POST(req: NextRequest) {
  try {
    // Bot protection (backlog #25): size cap, then one pure decision before
    // anything is read from env, written to the Sheet, provisioned or sent.
    // A tripped check gets the real success response and nothing else.
    const raw = await req.text();
    if (bodyTooLarge(raw, req.headers.get("content-length"))) {
      return NextResponse.json({ error: REQUEST_TOO_LARGE }, { status: 400 });
    }
    const decision = decideIntake(JSON.parse(raw));
    if (decision.action === "drop") {
      logBotDrop("intake", decision.reason);
      return NextResponse.json({ ok: true });
    }
    if (decision.action === "reject") {
      return NextResponse.json({ error: decision.error }, { status: decision.status });
    }
    const body = decision.body;

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
    // Columns 1–17 are frozen; 18–22 are the appended household block;
    // 23–29 are the lead-source block (backlog #26). See src/lib/intakeRow.ts.
    // Only the missing tail is written: a sheet that already carries the
    // first 22 headers gets W1:AC1 and nothing in A–V is rewritten.
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!1:1`,
    });

    const headerPatch = intakeHeaderPatch(headerRes.data.values?.[0] ?? []);

    if (headerPatch) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabName}!${headerPatch.range}`,
        valueInputOption: "RAW",
        requestBody: { values: [headerPatch.values] },
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
    // Cols 23–29 (backlog #26): the same first-touch record on every row of
    // the submission. decideIntake already validated it; no record means a
    // direct visit. The invite token is never part of it.
    const lead = body.leadSource ?? null;
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
              },
              lead
            )
          )
        : [buildIntakeRow(body, timestamp, {}, lead)];

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
        // The provisional tier (owner D4), or null for "Not sure" and "Prefer
        // not to say" — the email then names no tier (audit M17). Only the
        // email argument changes here; the Sheet row above is untouched.
        const provisionalTier = provisionalTierFor(body.level)?.name ?? null;
        const participantName = people[0]?.participantName ?? null;
        sendRecommendationEmail(body.email, body.name ?? "", recs, provisionalTier, participantName).catch(
          (err) => {
            console.error("Recommendation email failed (non-blocking):", err);
          }
        );
      }
    }

    // A signed-in holder gets back the ids of their own people this quiz was
    // about — chosen and newly added — so the booking form can start with
    // them (backlog #24). A guest's response is exactly what it always was;
    // ids are never handed to a session that could not list them anyway.
    if (signedIn) {
      const participantIds = Array.from(
        new Set(
          people
            .map((p) => p.participantId)
            .filter((id): id is string => Boolean(id))
        )
      );
      return NextResponse.json({ ok: true, participantIds });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Intake API error:", err);
    return NextResponse.json({ error: "Failed to submit intake." }, { status: 500 });
  }
}
