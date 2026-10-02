import {
  BUSINESS_NAME,
  OWNER_NAME,
  CONTACT_EMAIL,
  MAILING_ADDRESS,
} from "@/content/business";

// The sender and unsubscribe lines every commercial electronic message
// carries under CASL — group invitations and reminders to enroll. Transactional
// mail (passwords, payment received, cohort confirmed, agreements) does not.

/** "Sent by Tennis Bootcamp (Sina Kassaian), {address}, info@…" — address only when set. */
export function senderLine(address: string = MAILING_ADDRESS): string {
  const parts = [`${BUSINESS_NAME} (${OWNER_NAME})`, address.trim(), CONTACT_EMAIL].filter(
    Boolean
  );
  return `Sent by ${parts.join(", ")}.`;
}

export function unsubscribeLine(): string {
  return `Don't want invitations to groups? Reply to this email or write to ${CONTACT_EMAIL} and we'll stop sending them.`;
}

/** Plain-text block for the end of a text body. */
export function commercialFooterText(address: string = MAILING_ADDRESS): string {
  return `${senderLine(address)}\n${unsubscribeLine()}`;
}
