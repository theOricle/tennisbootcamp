import "server-only";
import { Resend } from "resend";
import type { Recommendation } from "@/lib/recommend";

const FROM = "Tennis Bootcamp <noreply@send.tennisbootcamp.ca>";
const BASE_URL = "https://tennisbootcamp.ca";

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
  recommendations: Recommendation[]
): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[STUB EMAIL — set RESEND_API_KEY] recommendations for ${to}`);
    return;
  }

  const firstName = name.trim().split(/\s+/)[0] || "Athlete";
  const subject = `Your Tennis Bootcamp program matches — ${firstName}`;

  const recCards = recommendations
    .slice(0, 3)
    .map(
      (r) => `
      <div style="margin-top:20px;border-top:1px solid rgba(255,255,255,0.10);padding-top:20px;">
        <p style="margin:0;font-size:15px;font-weight:700;color:#B4E655;">${r.program.title}</p>
        <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.70);font-style:italic;">&ldquo;${r.reason}&rdquo;</p>
        <a href="${BASE_URL}/programs/${r.program.slug}" style="display:inline-block;margin-top:12px;font-size:13px;color:#B4E655;text-decoration:none;font-weight:600;">Learn more &rarr;</a>
      </div>`
    )
    .join("");

  const bodyHtml = `
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#fff;">Hi ${firstName},</p>
    <p style="margin:0 0 16px;font-size:14px;color:rgba(255,255,255,0.70);">
      Thanks for completing the intake. Based on what you told us, here are the programs that fit best — we&rsquo;ll be in touch when cohort spots open.
    </p>
    ${recCards}
    <div style="margin-top:24px;">
      ${limeButton(`${BASE_URL}/intake`, "Review your results online →")}
    </div>
    ${signOff()}
  `;

  const textRecs = recommendations
    .slice(0, 3)
    .map((r) => `• ${r.program.title}\n  ${r.reason}\n  ${BASE_URL}/programs/${r.program.slug}`)
    .join("\n\n");

  const resend = new Resend(key);
  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: emailLayout(bodyHtml),
    text: `Hi ${firstName},\n\nThanks for completing the intake. Here are your top program matches:\n\n${textRecs}\n\nWe'll be in touch when cohort spots open.\n\n— Sina Kassaian, Tennis Bootcamp\nhttps://tennisbootcamp.ca`,
  });
}
