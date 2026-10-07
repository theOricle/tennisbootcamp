import {
  BUSINESS_NAME,
  OWNER_NAME,
  CONTACT_EMAIL,
  mailingAddress,
} from "@/content/business";

// The sender and unsubscribe lines every email to a player carries (CASL
// s. 6(2) applies to quotes and transaction messages too). Group invitations
// use their own unsubscribe wording; every other player email uses the general
// one. The password/activation link email and the emails to Sina carry neither.

export type FooterKind = "invitation" | "general";

/** "Sent by Sina Kassaian (Tennis Bootcamp), {address}, info@…" — address only when set. */
export function senderLine(address: string = mailingAddress()): string {
  const parts = [`${OWNER_NAME} (${BUSINESS_NAME})`, address.trim(), CONTACT_EMAIL].filter(
    Boolean
  );
  return `Sent by ${parts.join(", ")}.`;
}

export function unsubscribeLine(kind: FooterKind = "general"): string {
  return kind === "invitation"
    ? `Don't want invitations to groups? Reply to this email or write to ${CONTACT_EMAIL} and we'll stop sending them.`
    : `Don't want emails like this? Reply to this email or write to ${CONTACT_EMAIL} and we'll stop sending them.`;
}

/** Plain-text block for the end of a text body. */
export function commercialFooterText(
  kind: FooterKind = "general",
  address: string = mailingAddress()
): string {
  return `${senderLine(address)}\n${unsubscribeLine(kind)}`;
}
