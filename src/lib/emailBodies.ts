// Every email the site sends, as a pure builder: params in, { subject, html,
// text } out. No Resend, no server-only import, so src/scripts/test-privacy.ts
// can render each one and check what a player actually receives. email.ts
// does the sending.

import type { Recommendation } from "@/lib/recommend";
import { membershipNote } from "@/lib/membership";
import {
  LEVEL_STEPS,
  TIERS,
  tierEmblemPath,
  tierForLevel,
  tierOrdinal,
  tierProgress,
  type Tier,
} from "@/lib/tiers";
import { SITE_URL } from "@/lib/siteUrl";
import { senderLine, unsubscribeLine, commercialFooterText, type FooterKind } from "@/lib/casl";

// Follows NEXT_PUBLIC_SITE_URL (vercel.app fallback), so the domain switch is an env change.
const BASE_URL = SITE_URL;

/** Where "See it on your dashboard" lands (audit M35). */
export const DASHBOARD_URL = `${BASE_URL}/dashboard`;

// Secondary text inks (audit L22). The rgba whites they replace were
// unreliable in Outlook and fell below 4.5:1 on the card; each of these is a
// solid hex at 4.5:1 or better on the navy and on the card (test-tiers.ts
// pins the ratios). Body copy, muted labels, and the brighter emphasis line.
export const INK_BODY = "#C9D1DB";
export const INK_MUTED = "#A7B0BC";
export const INK_STRONG = "#E6EBF0";
/** An unlit pip on the email tier line: a step above the player's level. */
export const INK_UNLIT = "#1C2A3C";

export type EmailBody = { subject: string; html: string; text: string };

// ─── Shared branded wrapper ───────────────────────────────────────────────────

function emailLayout(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#061427;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#fff;">
  <div style="height:4px;background:#B4E655;"></div>
  <div style="max-width:580px;margin:0 auto;padding:40px 24px 48px;">
    <div style="margin-bottom:28px;">
      <span style="font-size:16px;font-weight:700;letter-spacing:0.12em;color:#B4E655;text-transform:uppercase;">Tennis Bootcamp</span>
    </div>
    <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.10);border-radius:16px;padding:32px;">
      ${bodyHtml}
    </div>
    <div style="margin-top:24px;text-align:center;font-size:13px;color:${INK_MUTED};line-height:1.6;">
      Sent by Tennis Bootcamp &middot;
      <a href="${BASE_URL}" style="color:${INK_MUTED};">Tennis Bootcamp</a>
      &middot; info@tennisbootcamp.ca
    </div>
  </div>
</body>
</html>`;
}

function limeButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:20px;padding:14px 28px;background:#B4E655;color:#061427;font-size:15px;font-weight:700;text-decoration:none;border-radius:100px;">${label}</a>`;
}

function outlineButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:16px;padding:12px 24px;border:1px solid #B4E655;color:#B4E655;font-size:14px;font-weight:600;text-decoration:none;border-radius:100px;">${label}</a>`;
}

function smallText(text: string): string {
  return `<p style="margin:16px 0 0;font-size:13px;color:${INK_MUTED};">${text}</p>`;
}

/**
 * Sender and unsubscribe lines (CASL) for every email to a player except the
 * password/activation link. Invitations use their own unsubscribe wording.
 */
function commercialFooter(kind: FooterKind): string {
  const style = `margin:0;font-size:13px;color:${INK_MUTED};line-height:1.6;`;
  return `<div style="margin-top:24px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.10);">
    <p style="${style}">${senderLine()}</p>
    <p style="${style}">${unsubscribeLine(kind)}</p>
  </div>`;
}

function signOff(): string {
  return `<p style="margin:28px 0 0;font-size:14px;color:${INK_BODY};">
    See you on the court,<br/>
    <strong style="color:#fff;">Sina Kassaian</strong><br/>
    <span style="color:${INK_MUTED};">Head Coach, Tennis Bootcamp</span>
  </p>`;
}

// ─── Who the message is about (household accounts, backlog #11) ───────────────
// Every email goes to the account holder. When the person it concerns is
// someone else on the account — a child, a spouse — the subject and the copy
// name them, so a parent with two kids can tell two emails apart at a glance.

function firstNameOf(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

export type Subject = {
  /** The holder's first name — who is reading. */
  holderFirst: string;
  /** The player's first name — who the email is about. */
  playerFirst: string;
  /** True when the holder is the player (the ordinary single-user case). */
  isSelf: boolean;
  /** "your" / "Maya's" — drops into a sentence either way. */
  possessive: string;
  /** "Your" / "Maya's" — sentence-initial. */
  Possessive: string;
};

function subjectOf(holderName: string, participantName?: string | null): Subject {
  const holderFirst = firstNameOf(holderName) || "Athlete";
  const playerFirst = firstNameOf(participantName) || holderFirst;
  const isSelf =
    playerFirst.toLowerCase() === holderFirst.toLowerCase() ||
    !participantName?.trim();
  return {
    holderFirst,
    playerFirst,
    isSelf,
    possessive: isSelf ? "your" : `${playerFirst}'s`,
    Possessive: isSelf ? "Your" : `${playerFirst}'s`,
  };
}

export function moneyCAD(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/**
 * The tier's emblem as an <img> (audit M35): the PNG the tier-emblem route
 * prerenders, scaled to `size`. `alt` is "" when the text beside it names the
 * tier. Width and height are attributes, so Outlook sizes it too.
 */
function emblemImg(tier: Tier, size: number, alt: string, extraStyle = ""): string {
  return `<img src="${BASE_URL}${tierEmblemPath(tier)}" width="${size}" height="${size}" alt="${alt}" style="display:inline-block;width:${size}px;height:${size}px;border:0;${extraStyle}" />`;
}

/** The inline tier chip on the invite: a 16px emblem beside the name. */
function tierChip(name: string): string {
  const tier = TIERS.find((t) => t.name === name);
  const mark = tier ? emblemImg(tier, 16, "", "vertical-align:-3px;margin-right:6px;") : "";
  return `<span style="display:inline-block;padding:3px 10px;border:1px solid rgba(180,230,85,0.4);border-radius:100px;font-size:13px;font-weight:700;color:#B4E655;">${mark}${name}</span>`;
}

/**
 * The tier line's cell width and total width. Thirteen 14px cells plus six
 * 2px and six 6px gaps come to 230px, which fits the card's content box on a
 * 375px phone (about 261px wide); 18px cells (282px) spilled past its border.
 */
const TIER_LINE_CELL = 14;

/** The gap after step `i`: 2px within a tier, 6px between tiers, none after the last. */
function tierLineGap(i: number): number {
  const next = LEVEL_STEPS[i + 1];
  if (next === undefined) return 0;
  return Math.floor(next) === Math.floor(LEVEL_STEPS[i]) ? 2 : 6;
}

const TIER_LINE_WIDTH = LEVEL_STEPS.reduce(
  (width, _step, i) => width + TIER_LINE_CELL + tierLineGap(i),
  0
);

/**
 * The tier line as a table (design specs §3.9), so it reads with images off:
 * thirteen `<td bgcolor>` cells, 2px apart within a tier and 6px between
 * tiers, lit in each tier's colour up to the player's level and unlit above
 * it, with "Love" and "Grand Slam" captions under the ends.
 */
export function tierLineTable(level: number): string {
  const steps = LEVEL_STEPS.map((step, i) => {
    const tier = tierForLevel(step)!;
    const lit = step <= level;
    const color = lit ? tier.color : INK_UNLIT;
    const gap = tierLineGap(i);
    const cell = `<td width="${TIER_LINE_CELL}" height="8" bgcolor="${color}" style="width:${TIER_LINE_CELL}px;height:8px;background:${color};font-size:0;line-height:0;">&nbsp;</td>`;
    const spacer = gap ? `<td width="${gap}" style="width:${gap}px;font-size:0;line-height:0;">&nbsp;</td>` : "";
    return cell + spacer;
  }).join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:14px 0 0;">
      <tr>${steps}</tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${TIER_LINE_WIDTH}" style="border-collapse:collapse;width:${TIER_LINE_WIDTH}px;">
      <tr>
        <td style="padding:6px 0 0;font-size:13px;color:${INK_MUTED};">Love</td>
        <td align="right" style="padding:6px 0 0;font-size:13px;color:${INK_MUTED};text-align:right;">Grand Slam</td>
      </tr>
    </table>`;
}

/** "Tier 3 of 7. Next tier: Break at 4.0." · "Tier 7 of 7. That's the top of the ladder." */
export function tierStandingLine(level: number | string): string {
  const progress = tierProgress(level);
  if (!progress) return "";
  const caption = progress.next ? progress.caption : "That's the top of the ladder.";
  return `${tierOrdinal(progress.tier)}. ${caption}`;
}

// ─── Link email (password / activation) — no footer ───────────────────────────

export function buildLinkEmail(
  subject: string,
  link: string,
  actionLabel: string
): EmailBody {
  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#fff;">One quick step</p>
    <p style="margin:0 0 4px;font-size:14px;color:${INK_BODY};">Click the button below to ${actionLabel}:</p>
    ${limeButton(link, `${actionLabel.charAt(0).toUpperCase()}${actionLabel.slice(1)} →`)}
    ${smallText("This link expires in 24 hours. If you didn't request this, you can safely ignore it.")}
    ${signOff()}
  `;

  return {
    subject,
    html: emailLayout(bodyHtml),
    text: `Click the link below to ${actionLabel}:\n${link}\n\nThis link expires in 24 hours.\n\n— Sina Kassaian, Tennis Bootcamp`,
  };
}

// ─── Quiz result ──────────────────────────────────────────────────────────────

/**
 * The quiz result (audit M17, M35). `provisionalTierName` is the tier the
 * self-estimate maps to (owner D4), or null when the player answered "Not
 * sure" or "Prefer not to say" — then the email says thanks and names no
 * tier, and the subject never claims one either way. `participantName` is
 * the first player the quiz was about, so a parent reads "Maya's likely tier".
 */
export function buildRecommendationEmail(
  name: string,
  recommendations: Recommendation[],
  provisionalTierName?: string | null,
  participantName?: string | null
): EmailBody {
  const who = subjectOf(name, participantName);
  const firstName = who.holderFirst;
  const top = recommendations[0];
  const programTitle = top?.program.title ?? "one of our programs";
  const subject = `Your Tennis Bootcamp answers are in — ${firstName}`;

  // Confirmation first; the assessment is a suggestion, never a required step
  // (backlog #19). HTML and text say the same thing in the same order.
  const done =
    "Your answers to the 2-minute quiz are in and there's nothing else you need to do. I review each player's level and schedule, then place them in a group and a time that fit.";
  const newAccount =
    "The first time you use an email address with us, we send it a link to set a password.";
  const tierSentence = provisionalTierName
    ? `From your answers, ${who.possessive} likely tier is ${provisionalTierName}. It's provisional — I confirm it when I place ${who.isSelf ? "you" : who.playerFirst}.`
    : `Thanks for telling us about ${who.possessive} game.`;
  const tierHtml = provisionalTierName
    ? `From your answers, ${who.possessive} likely tier is <strong style="color:#fff;">${provisionalTierName}</strong>. It's provisional — I confirm it when I place ${who.isSelf ? "you" : who.playerFirst}.`
    : `Thanks for telling us about ${who.possessive} game.`;
  const fit = `Based on your answers, ${programTitle} looks like ${who.possessive} fit.`;
  const fitHtml = `Based on your answers, <strong style="color:#B4E655;">${programTitle}</strong> looks like ${who.possessive} fit.`;
  const dashboardLine =
    "Your dashboard shows the availability you gave us and, once I set it, every player's tier.";
  const suggestion = who.isSelf
    ? "If you'd like your level confirmed on court before you're placed, you can book a 20-minute assessment with me. It's optional. The assessment is $20, and if you enroll in a program afterward that $20 comes off the price."
    : `If you'd like ${who.playerFirst}'s level confirmed on court before they're placed, you can book a 20-minute assessment with me. It's optional. The assessment is $20, and if ${who.playerFirst} enrolls in a program afterward that $20 comes off the price.`;

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">Hi ${firstName},</p>
    <p style="margin:0 0 16px;font-size:14px;color:${INK_BODY};">${done}</p>
    <p style="margin:0 0 16px;font-size:14px;color:${INK_BODY};">${newAccount}</p>
    <p style="margin:0 0 16px;font-size:14px;color:${INK_BODY};">${tierHtml} ${fitHtml}</p>
    <p style="margin:0;font-size:14px;color:${INK_BODY};">${dashboardLine}</p>
    <div>
      ${outlineButton(DASHBOARD_URL, "See it on your dashboard")}
    </div>
    <p style="margin:20px 0 4px;font-size:13px;color:${INK_MUTED};">${suggestion}</p>
    <div>
      ${outlineButton(`${BASE_URL}/assessment/book`, "Book Your Assessment")}
    </div>
    ${signOff()}
    ${commercialFooter("general")}
  `;

  return {
    subject,
    html: emailLayout(bodyHtml),
    text: `Hi ${firstName},\n\n${done}\n\n${newAccount}\n\n${tierSentence} ${fit}\n\n${dashboardLine}\n\nSee it on your dashboard: ${DASHBOARD_URL}\n\n${suggestion}\n\nBook Your Assessment: ${BASE_URL}/assessment/book\n\nSee you on the court,\nSina Kassaian\nHead Coach, Tennis Bootcamp\n${BASE_URL}\n\n${commercialFooterText("general")}`,
  };
}

// ─── Assessment booking confirmation ──────────────────────────────────────────

export function buildBookingConfirmationEmail(params: {
  name: string;
  participantName?: string | null;
  dateLabel: string;
  timeLabel: string;
  locationLabel?: string | null;
}): EmailBody {
  const { name, participantName, dateLabel, timeLabel, locationLabel } = params;
  const who = subjectOf(name, participantName);
  const subject = who.isSelf
    ? `You're booked: ${dateLabel} at ${timeLabel}`
    : `${who.playerFirst}'s assessment is booked: ${dateLabel} at ${timeLabel}`;

  const firstName = who.holderFirst;
  const whereLine = locationLabel
    ? locationLabel
    : "We'll confirm the exact court with you before your slot.";
  const membership = membershipNote();

  const detailRow = (label: string, value: string) => `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:${INK_MUTED};width:96px;vertical-align:top;">${label}</td>
      <td style="padding:6px 0;font-size:14px;color:#fff;font-weight:600;">${value}</td>
    </tr>`;

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">${
      who.isSelf ? `You're on court, ${firstName}.` : `${who.playerFirst} is on court.`
    }</p>
    <p style="margin:0 0 16px;font-size:14px;color:${INK_BODY};">
      ${who.Possessive} 20-minute player assessment is booked. Here's everything you need.
    </p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid rgba(255,255,255,0.10);margin-top:8px;">
      ${detailRow("When", `${dateLabel}, ${timeLabel}`)}
      ${detailRow("Where", whereLine)}
      ${detailRow("Bring", "A racquet if you have one, water, and court shoes.")}
    </table>
    <p style="margin:20px 0 0;font-size:13px;color:${INK_MUTED};">
      Need to move it? One free reschedule with 24 hours' notice — just reply to this email.
    </p>
    ${smallText(membership)}
    ${signOff()}
    ${commercialFooter("general")}
  `;

  const text = `${
    who.isSelf ? `You're booked, ${firstName}.` : `${who.playerFirst} is booked, ${firstName}.`
  }

${who.Possessive} 20-minute player assessment:
  When:  ${dateLabel}, ${timeLabel}
  Where: ${whereLine}
  Bring: A racquet if you have one, water, and court shoes.

Need to move it? One free reschedule with 24 hours' notice — just reply to this email.

${membership}

— Sina Kassaian, Tennis Bootcamp

${commercialFooterText("general")}`;

  return { subject, html: emailLayout(bodyHtml), text };
}

// ─── Assessment request received ──────────────────────────────────────────────

export function buildAssessmentRequestReceivedEmail(params: {
  name: string;
  participantName?: string | null;
}): EmailBody {
  const { name, participantName } = params;
  const who = subjectOf(name, participantName);
  const subject = who.isSelf
    ? "Your assessment request is in — we'll set your time"
    : `${who.playerFirst}'s assessment request is in — we'll set the time`;

  const firstName = who.holderFirst;

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">Got it, ${firstName}.</p>
    <p style="margin:0 0 16px;font-size:14px;color:${INK_BODY};">
      ${who.Possessive} 20-minute assessment request is in. We'll reach out within a day to set a time that fits the availability you gave us.
    </p>
    <p style="margin:0;font-size:14px;color:${INK_BODY};">
      No payment now — we'll confirm your time first. The assessment is $20, and if you enroll in a program afterward that $20 comes off the price.
    </p>
    ${smallText("Anything change on your end? Just reply to this email.")}
    ${signOff()}
    ${commercialFooter("general")}
  `;

  const text = `Got it, ${firstName}.

Your 20-minute assessment request is in. We'll reach out within a day to set a time that fits the availability you gave us.

No payment now — we'll confirm your time first. The assessment is $20, and if you enroll in a program afterward that $20 comes off the price.

Anything change on your end? Just reply to this email.

— Sina Kassaian, Tennis Bootcamp

${commercialFooterText("general")}`;

  return { subject, html: emailLayout(bodyHtml), text };
}

// ─── Assessment request → Sina (admin) — no footer ────────────────────────────

export function buildAssessmentRequestAdminEmail(params: {
  name: string;
  participantName?: string | null;
  email: string;
  phone?: string | null;
  selfLevel?: string | null;
  preferredTimes: string[];
  note?: string | null;
}): EmailBody {
  const { name, participantName, email, phone, selfLevel, preferredTimes, note } = params;
  const player = (participantName ?? "").trim();
  const subject =
    player && player.toLowerCase() !== name.trim().toLowerCase()
      ? `New assessment request: ${player} (account: ${name})`
      : `New assessment request: ${name}`;

  const detailRow = (label: string, value: string) => `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:${INK_MUTED};width:110px;vertical-align:top;">${label}</td>
      <td style="padding:6px 0;font-size:14px;color:#fff;font-weight:600;">${value}</td>
    </tr>`;

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">New assessment request</p>
    <p style="margin:0 0 16px;font-size:14px;color:${INK_BODY};">
      They're waiting on a time — the site told them we'd reach out within a day.
    </p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid rgba(255,255,255,0.10);margin-top:8px;">
      ${detailRow("Name", name)}
      ${detailRow("Email", email)}
      ${phone ? detailRow("Phone", phone) : ""}
      ${selfLevel ? detailRow("Self level", selfLevel) : ""}
      ${detailRow("Preferred", preferredTimes.length ? preferredTimes.join(" · ") : "No times given")}
      ${note ? detailRow("Note", note) : ""}
    </table>
    ${limeButton(`${BASE_URL}/admin/assessments`, "Open requests →")}
  `;

  const text = `New assessment request

Name:      ${name}
Email:     ${email}${phone ? `\nPhone:     ${phone}` : ""}${selfLevel ? `\nSelf level: ${selfLevel}` : ""}
Preferred: ${preferredTimes.length ? preferredTimes.join(", ") : "No times given"}${note ? `\nNote:      ${note}` : ""}

Assign a slot or record a time: ${BASE_URL}/admin/assessments`;

  return { subject, html: emailLayout(bodyHtml), text };
}

// ─── Cohort invitation ────────────────────────────────────────────────────────

export type CohortInviteParams = {
  /** Which player on the account the spot is for. */
  participantName?: string | null;
  levelLabel: string | null; // "3.0" or "3.0–3.5"; null when not tier-gated
  tierNames: string[];       // ["Deuce"] or ["Deuce","Break"]; [] when not tier-gated
  programTitle: string;
  cohortLabel: string;
  dayTimeLabel: string;      // "Tuesdays 6–7pm"
  startDateLabel: string;    // "Sep 8"
  weeks: number;
  priceCents: number;
  creditCents: number;       // 0 when the invitee has no unused assessment credit
  holdHours: number;
  enrollUrl: string;
};

/**
 * "Alex's Deuce group (3.0)" (owner D9): the tier name leads, the numeric
 * band follows in brackets; a spread reads "Deuce – Break group (3.0–4.5)".
 * An untiered cohort stays "Alex's Adult Bootcamps group".
 */
export function cohortInviteGroupName(
  params: Pick<CohortInviteParams, "participantName" | "levelLabel" | "tierNames" | "programTitle">
): string {
  const { participantName, levelLabel, tierNames, programTitle } = params;
  const player = (participantName ?? "").trim();
  const forWhom = player ? `${player.split(/\s+/)[0]}'s` : "Your";
  if (tierNames.length > 0) {
    const band = levelLabel ? ` (${levelLabel})` : "";
    return `${forWhom} ${tierNames.join(" – ")} group${band}`;
  }
  if (levelLabel) return `${forWhom} Level ${levelLabel} group`;
  return `${forWhom} ${programTitle} group`;
}

/** Only the subject, for the stub log when Resend isn't configured. */
export function cohortInviteSubject(
  params: Pick<CohortInviteParams, "participantName" | "levelLabel" | "tierNames" | "programTitle" | "dayTimeLabel" | "startDateLabel">
): string {
  const { dayTimeLabel, startDateLabel } = params;
  return `${cohortInviteGroupName(params)} is forming — ${dayTimeLabel}, starts ${startDateLabel}`;
}

export function buildCohortInviteEmail(params: CohortInviteParams): EmailBody {
  const {
    tierNames, programTitle, cohortLabel, dayTimeLabel,
    startDateLabel, weeks, priceCents, creditCents, holdHours, enrollUrl,
  } = params;

  const groupName = cohortInviteGroupName(params);
  const subject = cohortInviteSubject(params);

  const priceMath =
    creditCents > 0
      ? `${moneyCAD(priceCents)} − ${moneyCAD(creditCents)} assessment credit = <strong style="color:#fff;">${moneyCAD(priceCents - creditCents)}</strong>`
      : `<strong style="color:#fff;">${moneyCAD(priceCents)}</strong>`;
  const priceMathText =
    creditCents > 0
      ? `${moneyCAD(priceCents)} − ${moneyCAD(creditCents)} assessment credit = ${moneyCAD(priceCents - creditCents)}`
      : moneyCAD(priceCents);

  const tierLine = tierNames.length
    ? `<p style="margin:0 0 12px;">${tierNames.map(tierChip).join(`<span style="color:${INK_MUTED};margin:0 6px;">–</span>`)}</p>`
    : "";

  const detailRow = (label: string, value: string) => `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:${INK_MUTED};width:96px;vertical-align:top;">${label}</td>
      <td style="padding:6px 0;font-size:14px;color:#fff;font-weight:600;">${value}</td>
    </tr>`;

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">${groupName} is forming.</p>
    ${tierLine}
    <p style="margin:0 0 16px;font-size:14px;color:${INK_BODY};">
      We've built a ${programTitle} group around your level and the availability you gave us. Here's the schedule.
    </p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid rgba(255,255,255,0.10);margin-top:8px;">
      ${detailRow("Group", `${cohortLabel}`)}
      ${detailRow("Schedule", `${dayTimeLabel} · ${weeks} week${weeks === 1 ? "" : "s"}`)}
      ${detailRow("Starts", startDateLabel)}
      ${detailRow("Where", "Court details are confirmed in your enrollment email.")}
      ${detailRow("Price", priceMath)}
    </table>
    <p style="margin:20px 0 0;font-size:14px;color:${INK_STRONG};">
      Your spot is held for ${holdHours} hours.
    </p>
    ${limeButton(enrollUrl, "Claim my spot →")}
    ${smallText(`The link is personal to you. Terms: <a href="${BASE_URL}/legal/refund-policy" style="color:${INK_MUTED};">program policies</a>.`)}
    ${signOff()}
    ${commercialFooter("invitation")}
  `;

  const text = `${groupName} is forming.

We've built a ${programTitle} group around your level and the availability you gave us.

  Group:    ${cohortLabel}
  Schedule: ${dayTimeLabel} · ${weeks} week${weeks === 1 ? "" : "s"}
  Starts:   ${startDateLabel}
  Where:    Court details are confirmed in your enrollment email.
  Price:    ${priceMathText}

Your spot is held for ${holdHours} hours.

Claim my spot: ${enrollUrl}

The link is personal to you. Terms: ${BASE_URL}/legal/refund-policy

— Sina Kassaian, Tennis Bootcamp

${commercialFooterText("invitation")}`;

  return { subject, html: emailLayout(bodyHtml), text };
}

// ─── Cohort confirmed ─────────────────────────────────────────────────────────

export function buildCohortConfirmedEmail(params: {
  participantName?: string | null;
  cohortLabel: string;
  programTitle: string;
  startDateLabel: string;
  sessionLines: string[]; // "Tue Sep 8 · 6–7pm"
}): EmailBody {
  const { participantName, cohortLabel, programTitle, startDateLabel, sessionLines } = params;
  const player = (participantName ?? "").trim().split(/\s+/)[0] ?? "";
  const subject = player
    ? `${player} is in: ${cohortLabel} starts ${startDateLabel}`
    : `You're in: ${cohortLabel} starts ${startDateLabel}`;

  const sessionsHtml = sessionLines
    .map(
      (l) =>
        `<li style="padding:5px 0;font-size:14px;color:#fff;border-bottom:1px solid rgba(255,255,255,0.06);">${l}</li>`
    )
    .join("");
  const dashboardLine =
    "Every session date is on your dashboard too, with the rest of your programs.";

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">${
      player ? `${player}'s group is confirmed.` : "Your group is confirmed."
    }</p>
    <p style="margin:0 0 16px;font-size:14px;color:${INK_BODY};">
      ${programTitle} — ${cohortLabel} reached its minimum and starts ${startDateLabel}. Every session, in order:
    </p>
    <ul style="margin:0;padding:0;list-style:none;border-top:1px solid rgba(255,255,255,0.10);">
      ${sessionsHtml}
    </ul>
    <p style="margin:20px 0 0;font-size:14px;color:${INK_BODY};">
      Bring a racquet if you have one, water, and court shoes. If we cancel a session, it is made up inside your cohort's make-up window or becomes a credit on your account. The full rules are in our
      <a href="${BASE_URL}/legal/refund-policy" style="color:#B4E655;">Program Policies</a>.
    </p>
    <p style="margin:20px 0 0;font-size:14px;color:${INK_BODY};">${dashboardLine}</p>
    ${outlineButton(DASHBOARD_URL, "See it on your dashboard")}
    ${signOff()}
    ${commercialFooter("general")}
  `;

  const text = `${player ? `${player}'s group is confirmed.` : "Your group is confirmed."}

${programTitle} — ${cohortLabel} reached its minimum and starts ${startDateLabel}. Every session, in order:

${sessionLines.map((l) => `  ${l}`).join("\n")}

Bring a racquet if you have one, water, and court shoes. If we cancel a session, it is made up inside your cohort's make-up window or becomes a credit on your account. Program Policies: ${BASE_URL}/legal/refund-policy

${dashboardLine}

See it on your dashboard: ${DASHBOARD_URL}

— Sina Kassaian, Tennis Bootcamp

${commercialFooterText("general")}`;

  return { subject, html: emailLayout(bodyHtml), text };
}

// ─── Session cancelled ────────────────────────────────────────────────────────

export function buildSessionCancelledEmail(params: {
  cohortLabel: string;
  dateLabel: string;      // "Wednesday, July 30"
  reasonLine: string;     // one plain sentence
  makeup: { dateLabel: string; newEndDateLabel: string } | null;
  makeupMaxWeeks: number;
}): EmailBody {
  const { cohortLabel, dateLabel, reasonLine, makeup, makeupMaxWeeks } = params;
  const subject = makeup
    ? `${dateLabel}'s session is cancelled — your make-up is set`
    : `${dateLabel}'s session is cancelled — it converts to credit`;

  const outcomeHtml = makeup
    ? `<p style="margin:0 0 16px;font-size:14px;color:${INK_STRONG};">
        Make-up: <strong style="color:#B4E655;">${makeup.dateLabel}</strong>, same time. Your cohort now ends ${makeup.newEndDateLabel}.
      </p>`
    : `<p style="margin:0 0 16px;font-size:14px;color:${INK_STRONG};">
        Make-ups extend a cohort by at most ${makeupMaxWeeks} week${makeupMaxWeeks === 1 ? "" : "s"}, and this cancellation passes that cap — so this session converts to a credit toward your next program, prorated per session. We'll follow up by email with the amount.
      </p>`;

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">${dateLabel}'s ${cohortLabel} session is cancelled.</p>
    <p style="margin:0 0 12px;font-size:14px;color:${INK_BODY};">${reasonLine}</p>
    ${outcomeHtml}
    ${smallText(`You don't lose a session you didn't miss — the full rules are in the <a href="${BASE_URL}/legal/refund-policy" style="color:${INK_MUTED};">program policies</a>.`)}
    ${signOff()}
    ${commercialFooter("general")}
  `;

  const text = `${dateLabel}'s ${cohortLabel} session is cancelled.

${reasonLine}

${
  makeup
    ? `Make-up: ${makeup.dateLabel}, same time. Your cohort now ends ${makeup.newEndDateLabel}.`
    : `Make-ups extend a cohort by at most ${makeupMaxWeeks} week${makeupMaxWeeks === 1 ? "" : "s"}, and this cancellation passes that cap — so this session converts to a credit toward your next program, prorated per session. We'll follow up by email with the amount.`
}

Full rules: ${BASE_URL}/legal/refund-policy

— Sina Kassaian, Tennis Bootcamp

${commercialFooterText("general")}`;

  return { subject, html: emailLayout(bodyHtml), text };
}

// ─── Assessment complete ──────────────────────────────────────────────────────

/**
 * The level moment (audit M35): the tier's emblem, "You're a Deuce.", where
 * that sits on the ladder ("Tier 3 of 7. Next tier: Break at 4.0.") and the
 * tier line as a table that reads with images off. The dashboard shows the
 * same card. HTML and text carry the same facts in the same order.
 */
export function buildAssessmentCompleteEmail(params: {
  name: string;
  participantName?: string | null;
  levelLabel: string;
  coachNote: string;
}): EmailBody {
  const { name, participantName, levelLabel, coachNote } = params;
  const who = subjectOf(name, participantName);
  const subject = `${who.Possessive} level: ${levelLabel} — here's ${who.possessive} next step`;

  const firstName = who.holderFirst;
  const tier = tierForLevel(levelLabel);
  const level = Number(levelLabel);
  const standing = tierStandingLine(levelLabel);

  const headline = who.isSelf
    ? `Nice work out there, ${firstName}.`
    : `${who.playerFirst}'s read from the court is in, ${firstName}.`;
  const intro = who.isSelf
    ? "Here's your read from the court."
    : `Here's ${who.playerFirst}'s level and what comes next.`;
  const tierSentence = tier ? `${who.isSelf ? "You're" : `${who.playerFirst} is`} a ${tier.name}.` : "";
  const forming = `We're forming ${who.possessive} ${levelLabel} group around everyone's availability — invitations go out by email.`;
  const dashboardLine = `${who.Possessive} tier, level and what comes next are on your dashboard.`;
  const sooner = "Want to move sooner?";

  const tierBlock = tier
    ? `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:16px 0 0;">
      <tr>
        <td style="vertical-align:middle;padding-right:16px;">${emblemImg(tier, 64, `${tier.name} emblem`)}</td>
        <td style="vertical-align:middle;">
          <p style="margin:0;font-size:13px;color:${INK_MUTED};">${who.Possessive} level</p>
          <p style="margin:2px 0 0;font-size:22px;font-weight:700;color:#fff;">${tierSentence}</p>
          <p style="margin:4px 0 0;font-size:14px;color:${INK_BODY};">Level <strong style="color:#B4E655;">${levelLabel}</strong> · ${standing}</p>
        </td>
      </tr>
    </table>
    ${Number.isFinite(level) ? tierLineTable(level) : ""}`
    : `
    <div style="margin:8px 0 4px;">
      <span style="font-size:13px;color:${INK_MUTED};">${who.Possessive} level</span><br/>
      <span style="font-size:28px;font-weight:700;color:#B4E655;">${levelLabel}</span>
    </div>`;

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">${headline}</p>
    <p style="margin:0;font-size:14px;color:${INK_BODY};">${intro}</p>
    ${tierBlock}
    <p style="margin:20px 0 0;font-size:14px;color:${INK_STRONG};font-style:italic;border-left:2px solid #B4E655;padding-left:14px;">
      ${coachNote}
    </p>
    <p style="margin:20px 0 0;font-size:14px;color:${INK_BODY};">${forming}</p>
    <p style="margin:12px 0 0;font-size:14px;color:${INK_BODY};">${dashboardLine}</p>
    ${outlineButton(DASHBOARD_URL, "See it on your dashboard")}
    <p style="margin:20px 0 0;font-size:14px;color:${INK_BODY};">${sooner}</p>
    ${limeButton(`${BASE_URL}/programs`, "Browse Programs")}
    ${signOff()}
    ${commercialFooter("general")}
  `;

  const text = `${headline}

${intro}

${who.Possessive} level: ${levelLabel}${tier ? `\n${tierSentence}\n${standing}` : ""}

${coachNote}

${forming}

${dashboardLine}

See it on your dashboard: ${DASHBOARD_URL}

${sooner}

Browse Programs: ${BASE_URL}/programs

— Sina Kassaian, Tennis Bootcamp

${commercialFooterText("general")}`;

  return { subject, html: emailLayout(bodyHtml), text };
}

// ─── E-transfer instructions (backlog #12) ────────────────────────────────────

export function buildEtransferInstructionsEmail(params: {
  firstName: string;
  programTitle: string;
  cohortLabel: string;
  priceCents: number;
  creditCents: number;   // 0 when no unused assessment credit
  amountCents: number;   // price − credit
  recipientEmail: string;
  memo: string;
  cardUrl: string;       // enroll link (with invite token) for "pay by card instead"
}): EmailBody {
  const {
    firstName, programTitle, cohortLabel, priceCents, creditCents,
    amountCents, recipientEmail, memo, cardUrl,
  } = params;
  const subject = `Your spot in ${cohortLabel} is held — send your e-transfer`;

  const greeting = firstName ? `Your spot is held, ${firstName}.` : "Your spot is held.";
  const amountMath =
    creditCents > 0
      ? `${moneyCAD(priceCents)} − ${moneyCAD(creditCents)} assessment credit = <strong style="color:#fff;">${moneyCAD(amountCents)}</strong>`
      : `<strong style="color:#fff;">${moneyCAD(amountCents)}</strong>`;
  const amountMathText =
    creditCents > 0
      ? `${moneyCAD(priceCents)} − ${moneyCAD(creditCents)} assessment credit = ${moneyCAD(amountCents)}`
      : moneyCAD(amountCents);

  const detailRow = (label: string, value: string) => `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:${INK_MUTED};width:96px;vertical-align:top;">${label}</td>
      <td style="padding:6px 0;font-size:14px;color:#fff;font-weight:600;">${value}</td>
    </tr>`;

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">${greeting}</p>
    <p style="margin:0 0 16px;font-size:14px;color:${INK_BODY};">
      To finish enrolling in ${programTitle} — ${cohortLabel}, send an Interac e-transfer with the details below. Your spot stays held until the coach confirms the transfer arrived. Once it does, you're in, and the confirmation email follows.
    </p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid rgba(255,255,255,0.10);margin-top:8px;">
      ${detailRow("Amount", amountMath)}
      ${detailRow("Send to", `<a href="mailto:${recipientEmail}" style="color:#B4E655;">${recipientEmail}</a>`)}
      ${detailRow("Message", memo)}
    </table>
    <p style="margin:20px 0 0;font-size:14px;color:${INK_STRONG};">
      Put the message on the transfer exactly as shown — it's how we match your payment to your spot.
    </p>
    ${smallText(`Prefer to pay by card? <a href="${cardUrl}" style="color:${INK_MUTED};">Pay by card instead</a>. Refund terms: <a href="${BASE_URL}/legal/refund-policy" style="color:${INK_MUTED};">program policies</a>.`)}
    ${signOff()}
    ${commercialFooter("general")}
  `;

  const text = `${greeting}

To finish enrolling in ${programTitle} — ${cohortLabel}, send an Interac e-transfer with the details below. Your spot stays held until the coach confirms the transfer arrived. Once it does, you're in, and the confirmation email follows.

  Amount:   ${amountMathText}
  Send to:  ${recipientEmail}
  Message:  ${memo}

Put the message on the transfer exactly as shown — it's how we match your payment to your spot.

Prefer to pay by card? ${cardUrl}
Refund terms: ${BASE_URL}/legal/refund-policy

— Sina Kassaian, Tennis Bootcamp

${commercialFooterText("general")}`;

  return { subject, html: emailLayout(bodyHtml), text };
}

// ─── Payment received (backlog #15) ───────────────────────────────────────────

export function buildPaymentReceivedEmail(params: {
  participantName?: string | null;
  programTitle: string;
  cohortLabel: string;
  amountCents: number;
}): EmailBody {
  const { participantName, programTitle, cohortLabel, amountCents } = params;
  const player = (participantName ?? "").trim().split(/\s+/)[0] ?? "";
  const subject = player
    ? `Payment received for ${player} — ${cohortLabel}`
    : `Payment received — ${cohortLabel}`;

  const headline = player ? `${player}'s payment is in.` : "Your payment is in.";
  const spotLine = player ? `${player}'s spot is held.` : "Your spot is held.";
  const dashboardLine = "The program and its weekly slot are on your dashboard.";

  const detailRow = (label: string, value: string) => `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:${INK_MUTED};width:96px;vertical-align:top;">${label}</td>
      <td style="padding:6px 0;font-size:14px;color:#fff;font-weight:600;">${value}</td>
    </tr>`;

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">${headline}</p>
    <p style="margin:0 0 16px;font-size:14px;color:${INK_BODY};">
      We've received your e-transfer. ${spotLine} Nothing else to do on your side.
    </p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid rgba(255,255,255,0.10);margin-top:8px;">
      ${detailRow("Program", programTitle)}
      ${detailRow("Group", cohortLabel)}
      ${detailRow("Received", `<strong style="color:#fff;">${moneyCAD(amountCents)}</strong>`)}
    </table>
    <p style="margin:20px 0 0;font-size:14px;color:${INK_STRONG};">
      The group runs once enough players have paid to meet its minimum. The moment it does, we'll email you every session date and time.
    </p>
    <p style="margin:12px 0 0;font-size:14px;color:${INK_BODY};">${dashboardLine}</p>
    ${outlineButton(DASHBOARD_URL, "See it on your dashboard")}
    ${smallText(`Refund terms: <a href="${BASE_URL}/legal/refund-policy" style="color:${INK_MUTED};">program policies</a>.`)}
    ${signOff()}
    ${commercialFooter("general")}
  `;

  const text = `${headline}

We've received your e-transfer. ${spotLine} Nothing else to do on your side.

  Program:  ${programTitle}
  Group:    ${cohortLabel}
  Received: ${moneyCAD(amountCents)}

The group runs once enough players have paid to meet its minimum. The moment it does, we'll email you every session date and time.

${dashboardLine}

See it on your dashboard: ${DASHBOARD_URL}

Refund terms: ${BASE_URL}/legal/refund-policy

— Sina Kassaian, Tennis Bootcamp

${commercialFooterText("general")}`;

  return { subject, html: emailLayout(bodyHtml), text };
}

// ─── You're enrolled (audit H5) ───────────────────────────────────────────────
// To an email that already had an account when its enrollment was saved. A
// brand-new address gets the set-password link instead; this one already has
// a password (or a "Forgot password?" away from one), so it gets the fact and
// the dashboard, never a second "set your password".

export function buildEnrolledEmail(params: {
  /** The account holder — who is reading. */
  name: string;
  /** The player, when that isn't the holder. */
  participantName?: string | null;
  programTitle: string;
  cohortLabel: string;
  /** True once the payment is in (card); false while an e-transfer is on its way. */
  paid: boolean;
}): EmailBody {
  const { name, participantName, programTitle, cohortLabel, paid } = params;
  const who = subjectOf(name, participantName);
  const firstName = who.holderFirst;
  const group = `${programTitle} — ${cohortLabel}`;

  const subject = paid
    ? who.isSelf
      ? `You're enrolled: ${group}`
      : `${who.playerFirst} is enrolled: ${group}`
    : `${who.Possessive} spot in ${cohortLabel} is on your account`;

  const headline = paid
    ? who.isSelf
      ? `You're enrolled, ${firstName}.`
      : `${who.playerFirst} is enrolled.`
    : who.isSelf
      ? `Your spot is on your account, ${firstName}.`
      : `${who.playerFirst}'s spot is on your account.`;

  const statusLine = paid
    ? `${group} is paid and recorded on your Tennis Bootcamp account. The group runs once enough players have paid to meet its minimum; the moment it does, we'll email every session date and time.`
    : `${group} is recorded on your Tennis Bootcamp account. Once your e-transfer arrives and the coach marks it received, ${
        who.isSelf ? "you're" : `${who.playerFirst} is`
      } in, and the confirmation email follows.`;
  const dashboardLine =
    "Your dashboard shows every program on the account, its weekly slot and, once the group is set, every session date.";
  const signInLine =
    "Sign in with your email and password. Never set one? Use “Forgot password?” on the sign-in page and we'll email you a link.";
  const dashboardUrl = `${BASE_URL}/dashboard`;

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">${headline}</p>
    <p style="margin:0 0 16px;font-size:14px;color:${INK_BODY};">${statusLine}</p>
    <p style="margin:0;font-size:14px;color:${INK_BODY};">${dashboardLine}</p>
    ${limeButton(dashboardUrl, "Open your dashboard →")}
    ${smallText(signInLine)}
    ${signOff()}
    ${commercialFooter("general")}
  `;

  const text = `${headline}

${statusLine}

${dashboardLine}

Open your dashboard: ${dashboardUrl}

${signInLine}

— Sina Kassaian, Tennis Bootcamp

${commercialFooterText("general")}`;

  return { subject, html: emailLayout(bodyHtml), text };
}

// ─── E-transfer pending → Sina (admin) — no footer ────────────────────────────

export function buildEtransferPendingAdminEmail(params: {
  playerName: string;
  playerEmail: string;
  cohortLabel: string;
  cohortId: string;
  amountCents: number;
  memo: string;
}): EmailBody & { adminUrl: string } {
  const { playerName, playerEmail, cohortLabel, cohortId, amountCents, memo } = params;
  const subject = `E-transfer pending: ${playerName || playerEmail} — ${cohortLabel}`;
  const adminUrl = `${BASE_URL}/admin/cohorts/${cohortId}`;

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">${playerName || playerEmail} says their e-transfer is on its way.</p>
    <p style="margin:0 0 16px;font-size:14px;color:${INK_BODY};">
      Expect <strong style="color:#fff;">${moneyCAD(amountCents)}</strong> with the message “${memo}”. When it lands, mark the invite paid — the cohort confirms on its own once paid invites reach the minimum.
    </p>
    <p style="margin:0;font-size:14px;color:${INK_BODY};">Player: ${playerName || "—"} · ${playerEmail}</p>
    ${limeButton(adminUrl, "Open the cohort →")}
  `;

  const text = `${playerName || playerEmail} says their e-transfer is on its way.

Expect ${moneyCAD(amountCents)} with the message "${memo}". When it lands, mark the invite paid — the cohort confirms on its own once paid invites reach the minimum.

Player: ${playerName || "—"} · ${playerEmail}
Cohort: ${cohortLabel}

${adminUrl}`;

  return { subject, html: emailLayout(bodyHtml), text, adminUrl };
}

// ─── Payment settled to no invite → Sina (admin) — no footer ──────────────────
// Backlog #38: a paid card session whose player matched no invite row (by id,
// participant or — on a public cohort — email). The money is banked and the
// Sheet row is paid; only the invite needs the coach's hand.

export function buildPaymentUnmatchedAdminEmail(params: {
  sessionId: string;
  cohortLabel: string;
  cohortId: string;
  /** 1-based position of the player on the session, and how many it covered. */
  playerIndex: number;
  playerCount: number;
  /** The payer's address, so the coach knows whose invite to mark. */
  payerEmail: string;
}): EmailBody & { adminUrl: string } {
  const { sessionId, cohortLabel, cohortId, playerIndex, playerCount, payerEmail } = params;
  const subject = `Paid, no invite matched: ${cohortLabel} — player ${playerIndex} of ${playerCount}`;
  const adminUrl = `${BASE_URL}/admin/cohorts/${cohortId}`;
  const who = payerEmail || "the payer";

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">A payment landed that no invite claims.</p>
    <p style="margin:0 0 16px;font-size:14px;color:${INK_BODY};">
      ${who} paid for ${cohortLabel}; the enrollment row is marked paid, but player ${playerIndex} of ${playerCount} on that payment matched no invite in the cohort. Find their invite on the cohort page and mark it paid by hand, or send one — the cohort confirms on its own once paid invites reach the minimum.
    </p>
    <p style="margin:0;font-size:14px;color:${INK_BODY};">Stripe session: ${sessionId}</p>
    ${limeButton(adminUrl, "Open the cohort →")}
  `;

  const text = `A payment landed that no invite claims.

${who} paid for ${cohortLabel}; the enrollment row is marked paid, but player ${playerIndex} of ${playerCount} on that payment matched no invite in the cohort. Find their invite on the cohort page and mark it paid by hand, or send one — the cohort confirms on its own once paid invites reach the minimum.

Stripe session: ${sessionId}
Cohort: ${cohortLabel}

${adminUrl}`;

  return { subject, html: emailLayout(bodyHtml), text, adminUrl };
}
