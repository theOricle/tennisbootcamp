// Every email the site sends, as a pure builder: params in, { subject, html,
// text } out. No Resend, no server-only import, so src/scripts/test-privacy.ts
// can render each one and check what a player actually receives. email.ts
// does the sending.

import type { Recommendation } from "@/lib/recommend";
import { membershipNote } from "@/lib/membership";
import { tierForLevel } from "@/lib/tiers";
import { SITE_URL } from "@/lib/siteUrl";
import { senderLine, unsubscribeLine, commercialFooterText, type FooterKind } from "@/lib/casl";

// Follows NEXT_PUBLIC_SITE_URL (vercel.app fallback), so the domain switch is an env change.
const BASE_URL = SITE_URL;

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
    <div style="margin-top:24px;text-align:center;font-size:12px;color:rgba(255,255,255,0.35);line-height:1.6;">
      Sent by Tennis Bootcamp &middot;
      <a href="${BASE_URL}" style="color:rgba(255,255,255,0.35);">Tennis Bootcamp</a>
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
  return `<p style="margin:16px 0 0;font-size:13px;color:rgba(255,255,255,0.45);">${text}</p>`;
}

/**
 * Sender and unsubscribe lines (CASL) for every email to a player except the
 * password/activation link. Invitations use their own unsubscribe wording.
 */
function commercialFooter(kind: FooterKind): string {
  const style = "margin:0;font-size:12px;color:rgba(255,255,255,0.45);line-height:1.6;";
  return `<div style="margin-top:24px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.10);">
    <p style="${style}">${senderLine()}</p>
    <p style="${style}">${unsubscribeLine(kind)}</p>
  </div>`;
}

function signOff(): string {
  return `<p style="margin:28px 0 0;font-size:14px;color:rgba(255,255,255,0.70);">
    See you on the court,<br/>
    <strong style="color:#fff;">Sina Kassaian</strong><br/>
    <span style="color:rgba(255,255,255,0.45);">Head Coach, Tennis Bootcamp</span>
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

function tierChip(name: string): string {
  return `<span style="display:inline-block;padding:3px 10px;border:1px solid rgba(180,230,85,0.4);border-radius:100px;font-size:12px;font-weight:700;color:#B4E655;">${name}</span>`;
}

// ─── Link email (password / activation) — no footer ───────────────────────────

export function buildLinkEmail(
  subject: string,
  link: string,
  actionLabel: string
): EmailBody {
  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#fff;">One quick step</p>
    <p style="margin:0 0 4px;font-size:14px;color:rgba(255,255,255,0.70);">Click the button below to ${actionLabel}:</p>
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

export function buildRecommendationEmail(
  name: string,
  recommendations: Recommendation[],
  tentativeLevel?: string
): EmailBody {
  const firstName = name.trim().split(/\s+/)[0] || "Athlete";
  const top = recommendations[0];
  const programTitle = top?.program.title ?? "one of our programs";
  const levelLine = tentativeLevel
    ? `You profile like a <strong style="color:#fff;">Level ${tentativeLevel}</strong> player`
    : `Thanks for telling us about your game`;
  const subject = tentativeLevel
    ? `Your answers are in — you profile like a Level ${tentativeLevel} player`
    : `Your Tennis Bootcamp answers are in — ${firstName}`;

  // Confirmation first; the assessment is a suggestion, never a required step
  // (backlog #19). HTML and text say the same thing in the same order.
  const done =
    "Your answers to the 2-minute quiz are in and there's nothing else you need to do. I review each player's level and schedule, then place them in a group and a time that fit.";
  const newAccount =
    "The first time you use an email address with us, we send it a link to set a password.";
  const suggestion =
    "If you'd like your level confirmed on court before you're placed, you can book a 20-minute assessment with me. It's optional. The assessment is $20, and if you enroll in a program afterward that $20 comes off the price.";

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">Hi ${firstName},</p>
    <p style="margin:0 0 16px;font-size:14px;color:rgba(255,255,255,0.70);">${done}</p>
    <p style="margin:0 0 16px;font-size:14px;color:rgba(255,255,255,0.70);">${newAccount}</p>
    <p style="margin:0 0 16px;font-size:14px;color:rgba(255,255,255,0.70);">
      ${levelLine}. Based on your answers, <strong style="color:#B4E655;">${programTitle}</strong> looks like your fit.
    </p>
    <p style="margin:0 0 4px;font-size:13px;color:rgba(255,255,255,0.60);">${suggestion}</p>
    <div>
      ${outlineButton(`${BASE_URL}/assessment/book`, "Book Your Assessment")}
    </div>
    ${signOff()}
    ${commercialFooter("general")}
  `;

  return {
    subject,
    html: emailLayout(bodyHtml),
    text: `Hi ${firstName},\n\n${done}\n\n${newAccount}\n\n${tentativeLevel ? `You profile like a Level ${tentativeLevel} player.` : "Thanks for telling us about your game."} Based on your answers, ${programTitle} looks like your fit.\n\n${suggestion}\n\nBook Your Assessment: ${BASE_URL}/assessment/book\n\nSee you on the court,\nSina Kassaian\nHead Coach, Tennis Bootcamp\n${BASE_URL}\n\n${commercialFooterText("general")}`,
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
      <td style="padding:6px 0;font-size:13px;color:rgba(255,255,255,0.45);width:96px;vertical-align:top;">${label}</td>
      <td style="padding:6px 0;font-size:14px;color:#fff;font-weight:600;">${value}</td>
    </tr>`;

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">${
      who.isSelf ? `You're on court, ${firstName}.` : `${who.playerFirst} is on court.`
    }</p>
    <p style="margin:0 0 16px;font-size:14px;color:rgba(255,255,255,0.70);">
      ${who.Possessive} 20-minute player assessment is booked. Here's everything you need.
    </p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid rgba(255,255,255,0.10);margin-top:8px;">
      ${detailRow("When", `${dateLabel}, ${timeLabel}`)}
      ${detailRow("Where", whereLine)}
      ${detailRow("Bring", "A racquet if you have one, water, and court shoes.")}
    </table>
    <p style="margin:20px 0 0;font-size:13px;color:rgba(255,255,255,0.60);">
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
    <p style="margin:0 0 16px;font-size:14px;color:rgba(255,255,255,0.70);">
      ${who.Possessive} 20-minute assessment request is in. We'll reach out within a day to set a time that fits the availability you gave us.
    </p>
    <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.70);">
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
      <td style="padding:6px 0;font-size:13px;color:rgba(255,255,255,0.45);width:110px;vertical-align:top;">${label}</td>
      <td style="padding:6px 0;font-size:14px;color:#fff;font-weight:600;">${value}</td>
    </tr>`;

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">New assessment request</p>
    <p style="margin:0 0 16px;font-size:14px;color:rgba(255,255,255,0.70);">
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

/** Only the subject, for the stub log when Resend isn't configured. */
export function cohortInviteSubject(
  params: Pick<CohortInviteParams, "participantName" | "levelLabel" | "programTitle" | "dayTimeLabel" | "startDateLabel">
): string {
  const { participantName, levelLabel, programTitle, dayTimeLabel, startDateLabel } = params;
  const player = (participantName ?? "").trim();
  const forWhom = player ? `${player.split(/\s+/)[0]}'s` : "Your";
  const groupName = levelLabel
    ? `${forWhom} Level ${levelLabel} group`
    : `${forWhom} ${programTitle} group`;
  return `${groupName} is forming — ${dayTimeLabel}, starts ${startDateLabel}`;
}

export function buildCohortInviteEmail(params: CohortInviteParams): EmailBody {
  const {
    participantName, levelLabel, tierNames, programTitle, cohortLabel, dayTimeLabel,
    startDateLabel, weeks, priceCents, creditCents, holdHours, enrollUrl,
  } = params;
  const player = (participantName ?? "").trim();
  const forWhom = player ? `${player.split(/\s+/)[0]}'s` : "Your";

  const groupName = levelLabel
    ? `${forWhom} Level ${levelLabel} group`
    : `${forWhom} ${programTitle} group`;
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
    ? `<p style="margin:0 0 12px;">${tierNames.map(tierChip).join('<span style="color:rgba(255,255,255,0.4);margin:0 6px;">–</span>')}</p>`
    : "";

  const detailRow = (label: string, value: string) => `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:rgba(255,255,255,0.45);width:96px;vertical-align:top;">${label}</td>
      <td style="padding:6px 0;font-size:14px;color:#fff;font-weight:600;">${value}</td>
    </tr>`;

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">${groupName} is forming.</p>
    ${tierLine}
    <p style="margin:0 0 16px;font-size:14px;color:rgba(255,255,255,0.70);">
      We've built a ${programTitle} group around your level and the availability you gave us. Here's the schedule.
    </p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid rgba(255,255,255,0.10);margin-top:8px;">
      ${detailRow("Group", `${cohortLabel}`)}
      ${detailRow("Schedule", `${dayTimeLabel} · ${weeks} week${weeks === 1 ? "" : "s"}`)}
      ${detailRow("Starts", startDateLabel)}
      ${detailRow("Where", "Court details are confirmed in your enrollment email.")}
      ${detailRow("Price", priceMath)}
    </table>
    <p style="margin:20px 0 0;font-size:14px;color:rgba(255,255,255,0.85);">
      Your spot is held for ${holdHours} hours.
    </p>
    ${limeButton(enrollUrl, "Claim my spot →")}
    ${smallText(`The link is personal to you. Terms: <a href="${BASE_URL}/legal/refund-policy" style="color:rgba(255,255,255,0.45);">program policies</a>.`)}
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

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">${
      player ? `${player}'s group is confirmed.` : "Your group is confirmed."
    }</p>
    <p style="margin:0 0 16px;font-size:14px;color:rgba(255,255,255,0.70);">
      ${programTitle} — ${cohortLabel} reached its minimum and starts ${startDateLabel}. Every session, in order:
    </p>
    <ul style="margin:0;padding:0;list-style:none;border-top:1px solid rgba(255,255,255,0.10);">
      ${sessionsHtml}
    </ul>
    <p style="margin:20px 0 0;font-size:14px;color:rgba(255,255,255,0.70);">
      Bring a racquet if you have one, water, and court shoes. If we cancel a session, it is made up inside your cohort's make-up window or becomes a credit on your account. The full rules are in our
      <a href="${BASE_URL}/legal/refund-policy" style="color:#B4E655;">Program Policies</a>.
    </p>
    ${signOff()}
    ${commercialFooter("general")}
  `;

  const text = `${player ? `${player}'s group is confirmed.` : "Your group is confirmed."}

${programTitle} — ${cohortLabel} reached its minimum and starts ${startDateLabel}. Every session, in order:

${sessionLines.map((l) => `  ${l}`).join("\n")}

Bring a racquet if you have one, water, and court shoes. If we cancel a session, it is made up inside your cohort's make-up window or becomes a credit on your account. Program Policies: ${BASE_URL}/legal/refund-policy

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
    ? `<p style="margin:0 0 16px;font-size:14px;color:rgba(255,255,255,0.85);">
        Make-up: <strong style="color:#B4E655;">${makeup.dateLabel}</strong>, same time. Your cohort now ends ${makeup.newEndDateLabel}.
      </p>`
    : `<p style="margin:0 0 16px;font-size:14px;color:rgba(255,255,255,0.85);">
        Make-ups extend a cohort by at most ${makeupMaxWeeks} week${makeupMaxWeeks === 1 ? "" : "s"}, and this cancellation passes that cap — so this session converts to a credit toward your next program, prorated per session. We'll follow up by email with the amount.
      </p>`;

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">${dateLabel}'s ${cohortLabel} session is cancelled.</p>
    <p style="margin:0 0 12px;font-size:14px;color:rgba(255,255,255,0.70);">${reasonLine}</p>
    ${outcomeHtml}
    ${smallText(`You don't lose a session you didn't miss — the full rules are in the <a href="${BASE_URL}/legal/refund-policy" style="color:rgba(255,255,255,0.45);">program policies</a>.`)}
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
  const tierLine = tier
    ? `<p style="margin:12px 0 0;font-size:15px;color:rgba(255,255,255,0.85);">${
        who.isSelf ? "You're" : `${who.playerFirst} is`
      } a <strong style="color:#B4E655;">${tier.name}</strong>.</p>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">${
      who.isSelf
        ? `Nice work out there, ${firstName}.`
        : `Nice work out there from ${who.playerFirst}.`
    }</p>
    <p style="margin:0 0 16px;font-size:14px;color:rgba(255,255,255,0.70);">
      Here's ${who.possessive} read from the court.
    </p>
    <div style="margin:8px 0 4px;">
      <span style="font-size:13px;color:rgba(255,255,255,0.45);">${who.Possessive} level</span><br/>
      <span style="font-size:28px;font-weight:700;color:#B4E655;">${levelLabel}</span>
    </div>
    ${tierLine}
    <p style="margin:16px 0 0;font-size:14px;color:rgba(255,255,255,0.85);font-style:italic;border-left:2px solid #B4E655;padding-left:14px;">
      ${coachNote}
    </p>
    <p style="margin:20px 0 0;font-size:14px;color:rgba(255,255,255,0.70);">
      We're forming ${who.possessive} ${levelLabel} group around everyone's availability — invitations go out by email. Want to move sooner?
    </p>
    ${limeButton(`${BASE_URL}/programs`, "Browse programs →")}
    ${signOff()}
    ${commercialFooter("general")}
  `;

  const text = `${
    who.isSelf
      ? `Nice work out there, ${firstName}.`
      : `Nice work out there from ${who.playerFirst}.`
  }

${who.Possessive} level: ${levelLabel}${
    tier ? `\n${who.isSelf ? "You're" : `${who.playerFirst} is`} a ${tier.name}.` : ""
  }

${coachNote}

We're forming ${who.possessive} ${levelLabel} group around everyone's availability — invitations go out by email. Want to move sooner? Just reply.

Browse programs: ${BASE_URL}/programs

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
      <td style="padding:6px 0;font-size:13px;color:rgba(255,255,255,0.45);width:96px;vertical-align:top;">${label}</td>
      <td style="padding:6px 0;font-size:14px;color:#fff;font-weight:600;">${value}</td>
    </tr>`;

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">${greeting}</p>
    <p style="margin:0 0 16px;font-size:14px;color:rgba(255,255,255,0.70);">
      To finish enrolling in ${programTitle} — ${cohortLabel}, send an Interac e-transfer with the details below. Your spot stays held until the coach confirms the transfer arrived. Once it does, you're in, and the confirmation email follows.
    </p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid rgba(255,255,255,0.10);margin-top:8px;">
      ${detailRow("Amount", amountMath)}
      ${detailRow("Send to", `<a href="mailto:${recipientEmail}" style="color:#B4E655;">${recipientEmail}</a>`)}
      ${detailRow("Message", memo)}
    </table>
    <p style="margin:20px 0 0;font-size:14px;color:rgba(255,255,255,0.85);">
      Put the message on the transfer exactly as shown — it's how we match your payment to your spot.
    </p>
    ${smallText(`Prefer to pay by card? <a href="${cardUrl}" style="color:rgba(255,255,255,0.45);">Pay by card instead</a>. Refund terms: <a href="${BASE_URL}/legal/refund-policy" style="color:rgba(255,255,255,0.45);">program policies</a>.`)}
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

  const detailRow = (label: string, value: string) => `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:rgba(255,255,255,0.45);width:96px;vertical-align:top;">${label}</td>
      <td style="padding:6px 0;font-size:14px;color:#fff;font-weight:600;">${value}</td>
    </tr>`;

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">${headline}</p>
    <p style="margin:0 0 16px;font-size:14px;color:rgba(255,255,255,0.70);">
      We've received your e-transfer. ${spotLine} Nothing else to do on your side.
    </p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid rgba(255,255,255,0.10);margin-top:8px;">
      ${detailRow("Program", programTitle)}
      ${detailRow("Group", cohortLabel)}
      ${detailRow("Received", `<strong style="color:#fff;">${moneyCAD(amountCents)}</strong>`)}
    </table>
    <p style="margin:20px 0 0;font-size:14px;color:rgba(255,255,255,0.85);">
      The group runs once enough players have paid to meet its minimum. The moment it does, we'll email you every session date and time.
    </p>
    ${smallText(`Refund terms: <a href="${BASE_URL}/legal/refund-policy" style="color:rgba(255,255,255,0.45);">program policies</a>.`)}
    ${signOff()}
    ${commercialFooter("general")}
  `;

  const text = `${headline}

We've received your e-transfer. ${spotLine} Nothing else to do on your side.

  Program:  ${programTitle}
  Group:    ${cohortLabel}
  Received: ${moneyCAD(amountCents)}

The group runs once enough players have paid to meet its minimum. The moment it does, we'll email you every session date and time.

Refund terms: ${BASE_URL}/legal/refund-policy

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
    <p style="margin:0 0 16px;font-size:14px;color:rgba(255,255,255,0.70);">
      Expect <strong style="color:#fff;">${moneyCAD(amountCents)}</strong> with the message “${memo}”. When it lands, mark the invite paid — the cohort confirms on its own once paid invites reach the minimum.
    </p>
    <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.70);">Player: ${playerName || "—"} · ${playerEmail}</p>
    ${limeButton(adminUrl, "Open the cohort →")}
  `;

  const text = `${playerName || playerEmail} says their e-transfer is on its way.

Expect ${moneyCAD(amountCents)} with the message "${memo}". When it lands, mark the invite paid — the cohort confirms on its own once paid invites reach the minimum.

Player: ${playerName || "—"} · ${playerEmail}
Cohort: ${cohortLabel}

${adminUrl}`;

  return { subject, html: emailLayout(bodyHtml), text, adminUrl };
}
