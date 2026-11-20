// The one escape for email HTML (backlog #43). Every value a person typed (a
// name, an email address, a phone, a level, a note, a cohort label) goes
// through it before it lands in an email's HTML, as text or inside a quoted
// attribute, so a typed value can never open a tag, a link or an image. The
// five characters that can do that become entities; everything else stays as
// typed, accents included, so "O'Neil" and "Zoë" read right in the inbox.
//
// Escape a value once, where it enters the HTML. The plain-text part and the
// subject line never use it: neither is HTML. Links, prices and dates the app
// builds itself are not passed through it.

const ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** `&`, `<`, `>`, `"` and `'` as entities. A missing value is "". */
export function escapeHtml(value: string | null | undefined): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ENTITIES[ch]);
}
