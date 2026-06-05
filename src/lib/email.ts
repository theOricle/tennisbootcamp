import "server-only";
import { Resend } from "resend";

// Shared helper for all transactional link emails.
// Falls back to console.log when RESEND_API_KEY is absent.
export async function sendLinkEmail(
  to: string,
  subject: string,
  link: string,
  actionLabel: string  // e.g. "set your password" | "reset your password"
): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[STUB EMAIL — set RESEND_API_KEY] ${subject} for ${to}:\n${link}`);
    return;
  }
  const resend = new Resend(key);
  await resend.emails.send({
    from: "Tennis Bootcamp <noreply@send.tennisbootcamp.ca>",
    to,
    subject,
    html: `<p>Click the link below to ${actionLabel}:</p><p><a href="${link}">${link}</a></p><p>This link expires in 24 hours.</p>`,
    text: `Click the link below to ${actionLabel}:\n${link}\n\nThis link expires in 24 hours.`,
  });
}
