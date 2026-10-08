// The /api/intake gate (backlog #25): one pure decision the route makes
// before it touches the Sheet, Supabase, MailerLite or Resend.
//
//   drop    → a bot. The route answers { ok: true } and does nothing else.
//   reject  → a malformed submission. The route answers 400 with `error`.
//   accept  → a real submission; `body` is the request body with its text
//             fields trimmed and capped and the two bot fields removed.
//
// The Sheet contract is untouched: no field is renamed, reordered or added
// to the row — src/lib/intakeRow.ts reads the accepted body exactly as it
// read the raw one. Pure, so src/scripts/test-intake-guard.ts pins the order
// of operations.

import {
  checkBot,
  cleanText,
  isValidEmail,
  stripBotFields,
  TEXT_LIMITS,
  type BotReason,
} from "@/lib/botCheck";
import type { IntakeFormSnapshot } from "@/lib/recommend";
import { LEAD_SOURCE_FIELD, sanitizeLeadSource, type FirstTouch } from "@/lib/leadSource";

export const INTAKE_INVALID_EMAIL = "Please provide a valid email.";

/**
 * The accepted body. `email` is a validated string; the other named fields
 * are what the wizard sends and what the route always read them as (it used
 * to read an untyped `req.json()`). Everything else stays loosely typed.
 */
export type IntakeAcceptedBody = Record<string, unknown> & {
  email: string;
  name?: string;
  phone?: string;
  who?: IntakeFormSnapshot["who"];
  level?: IntakeFormSnapshot["level"];
  /** Validated first touch (backlog #26); absent when the quiz sent none or it was all invalid. */
  leadSource?: FirstTouch;
};

export type IntakeDecision =
  | { action: "drop"; reason: BotReason }
  | { action: "reject"; status: 400; error: string }
  | { action: "accept"; body: IntakeAcceptedBody };

type Rec = Record<string, unknown>;

function isRecord(v: unknown): v is Rec {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Cap a list of short strings (goals, programs, locations, ids). */
function cleanShortList(v: unknown): unknown {
  return Array.isArray(v)
    ? v.slice(0, 50).map((x) => cleanText(x, TEXT_LIMITS.short))
    : v;
}

/** One guest participant block from the wizard. */
function cleanParticipant(p: unknown): unknown {
  if (!isRecord(p)) return p;
  return {
    ...p,
    name: cleanText(p.name, TEXT_LIMITS.name),
    relationship: cleanText(p.relationship, TEXT_LIMITS.short),
    ageBand: cleanText(p.ageBand, TEXT_LIMITS.short),
    selfLevel: cleanText(p.selfLevel, TEXT_LIMITS.short),
  };
}

/**
 * Trim and cap every text field the route reads. Keys are never added or
 * renamed; non-string values pass through so the route's existing fallbacks
 * behave exactly as before.
 */
export function sanitizeIntakeBody(raw: Rec): Rec {
  const body: Rec = { ...raw };
  body.name = cleanText(body.name, TEXT_LIMITS.name);
  body.email = cleanText(body.email, TEXT_LIMITS.email);
  body.phone = cleanText(body.phone, TEXT_LIMITS.phone);
  body.who = cleanText(body.who, TEXT_LIMITS.short);
  body.level = cleanText(body.level, TEXT_LIMITS.short);
  body.ageBand = cleanText(body.ageBand, TEXT_LIMITS.short);
  body.area = cleanText(body.area, TEXT_LIMITS.area);
  body.notes = cleanText(body.notes, TEXT_LIMITS.note);
  body.recommendedProgram = cleanText(body.recommendedProgram, TEXT_LIMITS.short);
  body.goals = cleanShortList(body.goals);
  body.programs = cleanShortList(body.programs);
  body.preferredLocationIds = cleanShortList(body.preferredLocationIds);
  body.participantIds = cleanShortList(body.participantIds);
  if (Array.isArray(body.participants)) {
    body.participants = body.participants.slice(0, 10).map(cleanParticipant);
  }
  if (isRecord(body.participantProfiles)) {
    body.participantProfiles = Object.fromEntries(
      Object.entries(body.participantProfiles)
        .slice(0, 10)
        .map(([k, v]) => [k, cleanParticipant(v)])
    );
  }
  // Lead source (backlog #26): strings only, each capped, unknown keys (an
  // invite token above all) dropped; an empty or malformed record is removed.
  if (LEAD_SOURCE_FIELD in body) {
    const lead = sanitizeLeadSource(body[LEAD_SOURCE_FIELD]);
    if (lead) body[LEAD_SOURCE_FIELD] = lead;
    else delete body[LEAD_SOURCE_FIELD];
  }
  // Keys the wizard never sends stay absent — `{...raw}` plus `undefined`
  // assignments would still serialize identically, but keep the shape honest.
  for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
  return body;
}

/**
 * Decide what the route does with a parsed body. Order is the whole point:
 * bot check first (a bot never learns it was caught, and never reaches
 * validation), then validation, then the cleaned body for the real work.
 */
export function decideIntake(parsed: unknown): IntakeDecision {
  const verdict = checkBot(parsed);
  if (verdict.bot) return { action: "drop", reason: verdict.reason };

  const raw = isRecord(parsed) ? stripBotFields(parsed) : {};
  const body = sanitizeIntakeBody(raw);

  // The wizard already enforces this client-side; a real player never sees it.
  if (!isValidEmail(body.email)) {
    return { action: "reject", status: 400, error: INTAKE_INVALID_EMAIL };
  }

  return { action: "accept", body: body as IntakeAcceptedBody };
}
