// Where each quiz-taker came from (backlog #26).
//
// First touch: the first time a visitor lands with an ad or campaign tag in
// the URL (utm_*, gclid, fbclid), or arrives from another site, a small
// first-party record goes into localStorage under FIRST_TOUCH_KEY. It holds
// those tags, the landing path without its query string, the referrer's
// origin (never the full referrer URL) and the date. A visit with none of
// them stores nothing, so a later tagged visit can still be recorded. An
// unexpired record is never overwritten: the first touch wins for 90 days.
//
// The quiz sends the record as one optional field (LEAD_SOURCE_FIELD) and
// /api/intake validates it here (strings only, capped, unknown keys dropped)
// before src/lib/intakeRow.ts turns it into columns 23–29.
//
// Never stored, never sent: the invite token, or anything else not named in
// FIRST_TOUCH_KEYS. GA4 is not involved in any of this.
//
// Pure (no window, no imports) so src/scripts/test-lead-source.ts can pin
// every rule; the browser entry points take their window-ish inputs as
// arguments.

export const FIRST_TOUCH_KEY = "tb_first_touch";

/** Request-body key the quiz sends the record under. */
export const LEAD_SOURCE_FIELD = "leadSource";

/** A record older than this is expired and may be replaced. */
export const FIRST_TOUCH_TTL_DAYS = 90;

/** Each value is cut to this many characters on the way into the Sheet. */
export const LEAD_SOURCE_MAX_LENGTH = 200;

/** The URL parameters that count as a tagged visit, in storage order. */
export const TAG_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "fbclid",
] as const;

/** Every key a record may hold. Anything else is dropped on read and on validation. */
export const FIRST_TOUCH_KEYS = [
  ...TAG_PARAMS,
  "landing_path",
  "referrer_origin",
  "first_seen",
] as const;

export type FirstTouchKey = (typeof FIRST_TOUCH_KEYS)[number];

/** The stored record and the validated request field: short strings only. */
export type FirstTouch = Partial<Record<FirstTouchKey, string>>;

/** The minimum of a Storage the capture needs; localStorage satisfies it. */
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

// ─── Dates ────────────────────────────────────────────────────────────────────

/** "YYYY-MM-DD" in UTC — the only date the record carries. */
export function dateStamp(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** True when the record is missing a readable date or that date is 90+ days old. */
export function isExpired(record: FirstTouch | null, now: Date): boolean {
  if (!record || typeof record.first_seen !== "string") return true;
  const seen = Date.parse(record.first_seen);
  if (!Number.isFinite(seen)) return true;
  return now.getTime() - seen >= FIRST_TOUCH_TTL_DAYS * 24 * 60 * 60 * 1000;
}

// ─── Validation (shared by the browser read and the route) ───────────────────

/**
 * The record with only the known keys, each a trimmed non-empty string cut to
 * LEAD_SOURCE_MAX_LENGTH. Non-strings and unknown keys (an invite token,
 * whatever a script posts) are dropped. Null when nothing valid is left or
 * the input is not an object.
 */
export function sanitizeLeadSource(value: unknown): FirstTouch | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const out: FirstTouch = {};
  for (const key of FIRST_TOUCH_KEYS) {
    const v = raw[key];
    if (typeof v !== "string") continue;
    const s = v.trim().slice(0, LEAD_SOURCE_MAX_LENGTH);
    if (s) out[key] = s;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// ─── Capture ──────────────────────────────────────────────────────────────────

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True when `host` is one of ours or a subdomain of one of ours. */
export function isOwnHost(host: string, ownHosts: readonly string[]): boolean {
  const h = host.toLowerCase();
  return ownHosts.some((own) => {
    const o = own.toLowerCase();
    return o !== "" && (h === o || h.endsWith(`.${o}`));
  });
}

export type CaptureInput = {
  /** The landing URL, window.location.href. */
  href: string;
  /** document.referrer ("" when there is none). */
  referrer: string;
  /** Hostnames that are the site itself: a referrer from these is not a source. */
  ownHosts: readonly string[];
  /** The clock, for first_seen. */
  now: Date;
};

/**
 * The record a landing would store, or null when the visit carries no tag
 * and no external referrer. Reads only the named parameters — an invite
 * token on the same URL is never looked at — and keeps the landing path
 * without its query string and the referrer's origin only.
 */
export function firstTouchFromVisit(input: CaptureInput): FirstTouch | null {
  let url: URL;
  try {
    url = new URL(input.href);
  } catch {
    return null;
  }

  const record: FirstTouch = {};
  for (const key of TAG_PARAMS) {
    const v = url.searchParams.get(key);
    if (v && v.trim()) record[key] = v.trim().slice(0, LEAD_SOURCE_MAX_LENGTH);
  }

  const refHost = input.referrer ? hostOf(input.referrer) : null;
  const external = !!refHost && !isOwnHost(refHost, input.ownHosts);
  if (external) {
    try {
      record.referrer_origin = new URL(input.referrer).origin;
    } catch {
      // unreadable referrer: treated as none
    }
  }

  if (Object.keys(record).length === 0) return null;

  record.landing_path = url.pathname || "/";
  record.first_seen = dateStamp(input.now);
  return record;
}

/** The stored record if it parses and is unexpired, else null. Never throws. */
export function readFirstTouch(storage: StorageLike, now: Date): FirstTouch | null {
  try {
    const raw = storage.getItem(FIRST_TOUCH_KEY);
    if (!raw) return null;
    const record = sanitizeLeadSource(JSON.parse(raw));
    return isExpired(record, now) ? null : record;
  } catch {
    return null;
  }
}

/**
 * Store this visit's first touch unless an unexpired record is already there.
 * Returns what is in storage afterwards (the kept record, the new one, or
 * null when the visit stored nothing). Never throws.
 */
export function recordFirstTouch(
  storage: StorageLike,
  input: CaptureInput
): FirstTouch | null {
  const existing = readFirstTouch(storage, input.now);
  if (existing) return existing;
  const fresh = firstTouchFromVisit(input);
  if (!fresh) return null;
  try {
    storage.setItem(FIRST_TOUCH_KEY, JSON.stringify(fresh));
  } catch {
    // storage unavailable (private mode, quota, disabled): nothing to do
  }
  return fresh;
}

// ─── Sheet cells (columns 23–29) ─────────────────────────────────────────────

/** Header names for the seven lead-source columns, in order. */
export const LEAD_SOURCE_HEADERS = [
  "source",
  "medium",
  "campaign",
  "content",
  "click_id",
  "landing_page",
  "first_seen",
] as const;

/** `source`: utm_source, else the referrer's host, else "direct". */
export function leadSourceName(record: FirstTouch | null): string {
  if (record?.utm_source) return record.utm_source;
  const host = record?.referrer_origin ? hostOf(record.referrer_origin) : null;
  return host || "direct";
}

/** `click_id`: "gclid:…" or "fbclid:…", else "". */
export function leadClickId(record: FirstTouch | null): string {
  if (record?.gclid) return `gclid:${record.gclid}`;
  if (record?.fbclid) return `fbclid:${record.fbclid}`;
  return "";
}

/**
 * The seven cells. A missing record (no tag, no external referrer, storage
 * unavailable, or an older client) is a direct visit with everything else
 * blank. Every cell is a string.
 */
export function buildLeadSourceCells(record: FirstTouch | null): string[] {
  return [
    leadSourceName(record),
    record?.utm_medium ?? "",
    record?.utm_campaign ?? "",
    record?.utm_content ?? "",
    leadClickId(record),
    record?.landing_path ?? "",
    record?.first_seen ?? "",
  ];
}
