import "server-only";
import { Resend } from "resend";
import type { Recommendation } from "@/lib/recommend";
import { membershipNote } from "@/lib/membership";
import { tierForLevel } from "@/lib/tiers";

const FROM = "Tennis Bootcamp <noreply@send.tennisbootcamp.ca>";
const BASE_URL = "https://tennisbootcamp.ca";
const INBOX = "info@tennisbootcamp.ca";

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
      <a href="${BASE_URL}" style="color:rgba(255,255,255,0.35);">tennisbootcamp.ca</a>
      &middot; info@tennisbootcamp.ca
    </div>
  </div>
</body>
</html>`;
}

function limeButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:20px;padding:14px 28px;background:#B4E655;color:#061427;font-size:15px;font-weight:700;text-decoration:none;border-radius:100px;">${label}</a>`;
}

function smallText(text: string): string {
  return `<p style="margin:16px 0 0;font-size:13px;color:rgba(255,255,255,0.45);">${text}</p>`;
}

function signOff(): string {
  return `<p style="margin:28px 0 0;font-size:14px;color:rgba(255,255,255,0.70);">
    See you on the court,<br/>
    <strong style="color:#fff;">Sina Kassaian</strong><br/>
    <span style="color:rgba(255,255,255,0.45);">Head Coach, Tennis Bootcamp</span>
  </p>`;
}

// ─── sendLinkEmail ────────────────────────────────────────────────────────────

export async function sendLinkEmail(
  to: string,
  subject: string,
  link: string,
  actionLabel: string
): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[STUB EMAIL — set RESEND_API_KEY] ${subject} for ${to}:\n${link}`);
    return;
  }

  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#fff;">Action required</p>
    <p style="margin:0 0 4px;font-size:14px;color:rgba(255,255,255,0.70);">Click the button below to ${actionLabel}:</p>
    ${limeButton(link, `${actionLabel.charAt(0).toUpperCase()}${actionLabel.slice(1)} →`)}
    ${smallText("This link expires in 24 hours. If you didn't request this, you can safely ignore it.")}
    ${signOff()}
  `;

  const resend = new Resend(key);
  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: emailLayout(bodyHtml),
    text: `Click the link below to ${actionLabel}:\n${link}\n\nThis link expires in 24 hours.\n\n— Sina Kassaian, Tennis Bootcamp`,
  });
}

// ─── sendRecommendationEmail ──────────────────────────────────────────────────

export async function sendRecommendationEmail(
  to: string,
  name: string,
  recommendations: Recommendation[],
  tentativeLevel?: string
): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[STUB EMAIL — set RESEND_API_KEY] recommendations for ${to}`);
    return;
  }

  const firstName = name.trim().split(/\s+/)[0] || "Athlete";
  const top = recommendations[0];
  const programTitle = top?.program.title ?? "one of our programs";
  const levelLine = tentativeLevel
    ? `You profile like a <strong style="color:#fff;">Level ${tentativeLevel}</strong> player`
    : `You've got a strong profile`;
  const subject = tentativeLevel
    ? `You profile like a Level ${tentativeLevel} player — here's your next step`
    : `Your Tennis Bootcamp next step — ${firstName}`;

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">Hi ${firstName},</p>
    <p style="margin:0 0 16px;font-size:14px;color:rgba(255,255,255,0.70);">
      ${levelLine}. Based on your answers, <strong style="color:#B4E655;">${programTitle}</strong> looks like your fit.
    </p>
    <p style="margin:0 0 4px;font-size:14px;color:rgba(255,255,255,0.70);">
      Every player here is placed by an on-court assessment — 20 minutes with the coach — so the group you train with actually matches your level. The assessment is $20, and if you enroll in a program afterward that $20 comes off the price.
    </p>
    <div style="margin-top:8px;">
      ${limeButton(`${BASE_URL}/assessment/book`, "Book my 20-minute assessment →")}
    </div>
    ${smallText("Know what you want already? You can still enrol directly from any program page.")}
    ${signOff()}
  `;

  const resend = new Resend(key);
  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: emailLayout(bodyHtml),
    text: `Hi ${firstName},\n\n${tentativeLevel ? `You profile like a Level ${tentativeLevel} player.` : "You've got a strong profile."} Based on your answers, ${programTitle} looks like your fit.\n\nEvery player here is placed by an on-court assessment — 20 minutes with the coach — so the group you train with actually matches your level. The assessment is $20, and if you enroll in a program afterward that $20 comes off the price.\n\nBook my 20-minute assessment: ${BASE_URL}/assessment/book\n\nKnow what you want already? You can still enrol directly from any program page.\n\n— Sina Kassaian, Tennis Bootcamp\nhttps://tennisbootcamp.ca`,
  });
}

// ─── sendBookingConfirmationEmail ─────────────────────────────────────────────

export async function sendBookingConfirmationEmail(params: {
  to: string;
  name: string;
  dateLabel: string;
  timeLabel: string;
  locationLabel?: string | null;
}): Promise<void> {
  const { to, name, dateLabel, timeLabel, locationLabel } = params;
  const key = process.env.RESEND_API_KEY;
  const subject = `You're booked: ${dateLabel} at ${timeLabel}`;

  if (!key) {
    console.log(`[STUB EMAIL — set RESEND_API_KEY] ${subject} for ${to}`);
    return;
  }

  const firstName = name.trim().split(/\s+/)[0] || "Athlete";
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
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">You're on court, ${firstName}.</p>
    <p style="margin:0 0 16px;font-size:14px;color:rgba(255,255,255,0.70);">
      Your 20-minute player assessment is booked. Here's everything you need.
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
  `;

  const text = `You're booked, ${firstName}.

Your 20-minute player assessment:
  When:  ${dateLabel}, ${timeLabel}
  Where: ${whereLine}
  Bring: A racquet if you have one, water, and court shoes.

Need to move it? One free reschedule with 24 hours' notice — just reply to this email.

${membership}

— Sina Kassaian, Tennis Bootcamp`;

  const resend = new Resend(key);
  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: emailLayout(bodyHtml),
    text,
  });
}

// ─── sendAssessmentRequestReceivedEmail ───────────────────────────────────────

export async function sendAssessmentRequestReceivedEmail(params: {
  to: string;
  name: string;
}): Promise<void> {
  const { to, name } = params;
  const key = process.env.RESEND_API_KEY;
  const subject = "Your assessment request is in — we'll set your time";

  if (!key) {
    console.log(`[STUB EMAIL — set RESEND_API_KEY] ${subject} for ${to}`);
    return;
  }

  const firstName = name.trim().split(/\s+/)[0] || "Athlete";

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">Got it, ${firstName}.</p>
    <p style="margin:0 0 16px;font-size:14px;color:rgba(255,255,255,0.70);">
      Your 20-minute assessment request is in. We'll reach out within a day to set a time that fits the availability you gave us.
    </p>
    <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.70);">
      No payment now — we'll confirm your time first. The assessment is $20, and if you enroll in a program afterward that $20 comes off the price.
    </p>
    ${smallText("Anything change on your end? Just reply to this email.")}
    ${signOff()}
  `;

  const text = `Got it, ${firstName}.

Your 20-minute assessment request is in. We'll reach out within a day to set a time that fits the availability you gave us.

No payment now — we'll confirm your time first. The assessment is $20, and if you enroll in a program afterward that $20 comes off the price.

Anything change on your end? Just reply to this email.

— Sina Kassaian, Tennis Bootcamp`;

  const resend = new Resend(key);
  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: emailLayout(bodyHtml),
    text,
  });
}

// ─── sendAssessmentRequestAdminEmail ──────────────────────────────────────────

/** Internal notification to the inbox when a prospect requests a time. */
export async function sendAssessmentRequestAdminEmail(params: {
  name: string;
  email: string;
  phone?: string | null;
  selfLevel?: string | null;
  preferredTimes: string[];
  note?: string | null;
}): Promise<void> {
  const { name, email, phone, selfLevel, preferredTimes, note } = params;
  const key = process.env.RESEND_API_KEY;
  const subject = `New assessment request: ${name}`;

  if (!key) {
    console.log(
      `[STUB EMAIL — set RESEND_API_KEY] ${subject} for ${INBOX} — ` +
        `${email} · ${preferredTimes.join(", ") || "no times given"}`
    );
    return;
  }

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

  const resend = new Resend(key);
  await resend.emails.send({
    from: FROM,
    to: INBOX,
    subject,
    html: emailLayout(bodyHtml),
    text,
  });
}

// ─── sendAssessmentCompleteEmail ──────────────────────────────────────────────

export async function sendAssessmentCompleteEmail(params: {
  to: string;
  name: string;
  levelLabel: string;
  coachNote: string;
}): Promise<void> {
  const { to, name, levelLabel, coachNote } = params;
  const key = process.env.RESEND_API_KEY;
  const subject = `Your level: ${levelLabel} — here's your next step`;

  if (!key) {
    console.log(`[STUB EMAIL — set RESEND_API_KEY] ${subject} for ${to}`);
    return;
  }

  const firstName = name.trim().split(/\s+/)[0] || "Athlete";
  const tier = tierForLevel(levelLabel);
  const tierLine = tier
    ? `<p style="margin:12px 0 0;font-size:15px;color:rgba(255,255,255,0.85);">You're a <strong style="color:#B4E655;">${tier.name}</strong>.</p>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">Nice work out there, ${firstName}.</p>
    <p style="margin:0 0 16px;font-size:14px;color:rgba(255,255,255,0.70);">
      Here's your read from the court.
    </p>
    <div style="margin:8px 0 4px;">
      <span style="font-size:13px;color:rgba(255,255,255,0.45);">Your level</span><br/>
      <span style="font-size:28px;font-weight:700;color:#B4E655;">${levelLabel}</span>
    </div>
    ${tierLine}
    <p style="margin:16px 0 0;font-size:14px;color:rgba(255,255,255,0.85);font-style:italic;border-left:2px solid #B4E655;padding-left:14px;">
      ${coachNote}
    </p>
    <p style="margin:20px 0 0;font-size:14px;color:rgba(255,255,255,0.70);">
      We're forming your ${levelLabel} group around everyone's availability — invitations go out by email. Want to move sooner?
    </p>
    ${limeButton(`${BASE_URL}/programs`, "Browse programs →")}
    ${signOff()}
  `;

  const text = `Nice work out there, ${firstName}.

Your level: ${levelLabel}${tier ? `\nYou're a ${tier.name}.` : ""}

${coachNote}

We're forming your ${levelLabel} group around everyone's availability — invitations go out by email. Want to move sooner? Just reply.

Browse programs: ${BASE_URL}/programs

— Sina Kassaian, Tennis Bootcamp`;

  const resend = new Resend(key);
  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: emailLayout(bodyHtml),
    text,
  });
}
