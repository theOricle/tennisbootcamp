// The e-transfer details, carried from the sign-up page's last step to the
// page after it (backlog #101). A family that taps "I've sent the e-transfer"
// before sending it still needs the amount, the address and the message, so
// the step leaves them in the browser's session storage and the confirmation
// page shows them again. They never go in the URL: the message carries the
// players' names. Only a signed-out sign-up leaves them, and the page after
// takes them out of the store the moment it reads them (takeEtransferRaw), so
// a reload, the next person at a shared computer, another device or a later
// visit finds nothing and the page shows its "in your inbox" line instead.
//
// Pure and client-safe. The storage is handed in, so `npm test`
// (test-signup-four-fixes.ts) reads every path with a stand-in.

/** What the e-transfer step showed, in its own words. */
export type EtransferDetails = {
  /** The amount due, with its currency, as the step words it. */
  amount: string;
  /** The working under the amount (price, players, assessment credit), or null when it needs none. */
  breakdown: string | null;
  recipientEmail: string;
  memo: string;
};

/** The slice of Storage this reads and writes. */
export type HandoffStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const KEY_PREFIX = "tb:etransfer:";
const MAX_FIELD = 300;

/** One entry per cohort, so two sign-ups in one tab never read each other's. */
export function etransferHandoffKey(cohortId: string): string {
  return `${KEY_PREFIX}${cohortId}`;
}

const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= MAX_FIELD;

/** The details from a stored string, or null when it is not one this module wrote. */
export function parseEtransferDetails(raw: string | null | undefined): EtransferDetails | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown> | null;
    if (!v || typeof v !== "object") return null;
    if (!text(v.amount) || !text(v.recipientEmail) || !text(v.memo)) return null;
    return {
      amount: v.amount,
      breakdown: text(v.breakdown) ? v.breakdown : null,
      recipientEmail: v.recipientEmail,
      memo: v.memo,
    };
  } catch {
    return null;
  }
}

/** Leave the details for the page after this one. A browser that refuses storage loses nothing else. */
export function saveEtransferDetails(
  storage: HandoffStorage | null | undefined,
  cohortId: string,
  details: EtransferDetails
): void {
  try {
    storage?.setItem(etransferHandoffKey(cohortId), JSON.stringify(details));
  } catch {
    // Private mode or a full store: the page after falls back to the inbox line.
  }
}

/** The stored string for this cohort, or null. Raw, so a caller can compare it cheaply. */
export function readEtransferRaw(storage: HandoffStorage | null | undefined, cohortId: string): string | null {
  try {
    return storage?.getItem(etransferHandoffKey(cohortId)) ?? null;
  } catch {
    return null;
  }
}

// What this page load took out of the store, by cohort: the page reads it
// more than once while it draws, and the store is already empty.
const taken = new Map<string, string | null>();

/**
 * The stored string for this cohort, read once and removed from the store at
 * that moment. Later calls in the same page load answer from memory; a
 * reload starts with nothing.
 */
export function takeEtransferRaw(storage: HandoffStorage | null | undefined, cohortId: string): string | null {
  if (taken.has(cohortId)) return taken.get(cohortId) ?? null;
  if (!storage) return null;
  const raw = readEtransferRaw(storage, cohortId);
  try {
    storage.removeItem(etransferHandoffKey(cohortId));
  } catch {
    // A store that refuses the removal: nothing more to do here.
  }
  taken.set(cohortId, raw);
  return raw;
}

/** Whether the step should leave the details: signed out, and not for a seat that is already paid. */
export function shouldSaveEtransferDetails(input: { signedIn: boolean; alreadyPaid: unknown }): boolean {
  return !input.signedIn && input.alreadyPaid !== true;
}

/** One player's outcome on a transfer, as recordEtransferIntent answers it. */
export type EtransferPlayerOutcome = {
  alreadyPaid: boolean;
  amountCents: number;
  creditCents: number;
  /** Already paid, and the paid seat names this player. Left out, it does not. */
  paidNamesPlayer?: boolean;
};

/**
 * What a transfer still owes, player by player (backlog #102). A player whose
 * seat is already paid owes nothing and takes no credit; the others' amounts
 * and credits add up. `alreadyPaid` is true only when every player is paid:
 * then nothing is due and no email goes.
 */
export function etransferTally(outcomes: readonly EtransferPlayerOutcome[]): {
  alreadyPaid: boolean;
  /** One entry per player, in the order the request named them. */
  paidPlayers: boolean[];
  /** Which of the paid players the paid seat names: only these are named on the page. */
  paidNamed: boolean[];
  /** The amount still due, for the players not yet paid. */
  dueCents: number;
  /** The assessment credit inside that amount. */
  dueCreditCents: number;
} {
  const owing = outcomes.filter((o) => !o.alreadyPaid);
  return {
    alreadyPaid: outcomes.length > 0 && owing.length === 0,
    paidPlayers: outcomes.map((o) => o.alreadyPaid),
    paidNamed: outcomes.map((o) => o.alreadyPaid && o.paidNamesPlayer === true),
    dueCents: owing.reduce((sum, o) => sum + o.amountCents, 0),
    dueCreditCents: owing.reduce((sum, o) => sum + o.creditCents, 0),
  };
}

/**
 * The route's answer as the step reads it: who is already paid, which of
 * them a paid seat names, the amount still due and the credit inside it.
 * The amount is the route's own figure; the page never works it out again.
 */
export type EtransferSettled = { paid: boolean[]; named: boolean[]; dueCents: number; dueCreditCents: number };

/**
 * The route's answer, read strictly (backlog #102). Null when nobody is
 * already paid, or when the answer is not the shape this page expects for
 * its own players: the step then keeps the details it showed, as before.
 * An answer that says every player is paid, without naming them, counts for
 * all of them. With a player still owing, the answer must carry the amount
 * due (`dueCents`); without it the answer is not read at all.
 */
export function settledFromAnswer(answer: unknown, playerCount: number): EtransferSettled | null {
  if (!answer || typeof answer !== "object" || playerCount < 1) return null;
  const a = answer as {
    alreadyPaid?: unknown;
    paidPlayers?: unknown;
    paidNamed?: unknown;
    dueCents?: unknown;
    dueCreditCents?: unknown;
  };
  const flags = (v: unknown): boolean[] | null =>
    Array.isArray(v) && v.length === playerCount && v.every((x) => typeof x === "boolean") ? (v as boolean[]) : null;
  const cents = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
  const paid = flags(a.paidPlayers) ?? (a.alreadyPaid === true ? Array.from({ length: playerCount }, () => true) : null);
  if (!paid || !paid.some(Boolean)) return null;
  const everyone = paid.every(Boolean);
  const dueCents = everyone ? 0 : cents(a.dueCents);
  if (dueCents === null) return null;
  const named = flags(a.paidNamed) ?? paid.map(() => false);
  return {
    paid,
    // Named only where the seat is paid: a stray flag names nobody.
    named: named.map((n, i) => n && paid[i]),
    dueCents,
    dueCreditCents: everyone ? 0 : (cents(a.dueCreditCents) ?? 0),
  };
}

/** This tab's session storage, or null where there is none (the server, a locked-down browser). */
export function tabStorage(): HandoffStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
