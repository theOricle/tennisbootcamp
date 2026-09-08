import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  ensureSelfParticipant,
  ensureAccountForEmail,
  createParticipant,
  getParticipant,
  getAccount,
  findUserIdByEmail,
  fillPlayerContact,
  isRelationship,
  type Relationship,
} from "@/lib/players";

// "Who is this for?" resolved on the server (backlog #11).
//
// Every public form now asks who a submission is about. This module turns that
// answer into a participant id the flow can carry, whether the visitor is
// signed in (pick from their people) or not (type a person in).
//
// The rules:
//   • A signed-in holder may only name a participant on their own account.
//   • A guest booking for themselves behaves exactly as it did before — the
//     participant is resolved (or created) when their account is provisioned.
//   • A guest booking for someone else needs an account to hang that person
//     off, so one is created silently here. No email is sent from this module;
//     each flow keeps its own "set your password" moment.

export type ParticipantInput = {
  name?: unknown;
  relationship?: unknown;
  isMinor?: unknown;
  selfLevel?: unknown;
};

export type ResolvedParticipant = {
  accountId: string | null;
  participantId: string | null;
  /** The player's name — what the Sheet, the emails and the admin show. */
  participantName: string;
  relationship: Relationship | "";
  /** The account holder's own name, for "Maya's assessment is booked". */
  accountName: string;
  accountEmail: string;
  /** Optional self-estimate for this player, carried onto the booking. */
  selfLevel: string | null;
  /**
   * True when this resolution had to create the auth account itself (a guest
   * registering someone else). The flow still owes them a set-password email.
   */
  accountCreated: boolean;
};

function cleanName(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, 120) : "";
}

/** The signed-in user, or null. Never throws — a guest form must still work. */
export async function currentUser(): Promise<{ id: string; email: string } | null> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ? { id: user.id, email: user.email ?? "" } : null;
  } catch {
    return null;
  }
}

/**
 * Resolve one submission to one participant.
 *
 * `holderName` / `holderEmail` are the account holder's contact details (what
 * the form's contact step collects). `participantId` comes from the signed-in
 * chooser; `participant` from a signed-out block.
 */
export async function resolveSubmissionParticipant(input: {
  signedInUserId?: string | null;
  participantId?: unknown;
  participant?: ParticipantInput | null;
  holderName: string;
  holderEmail: string;
  holderPhone?: string | null;
  /** Fall back to the holder's own name when the block has none. */
  defaultName?: string;
}): Promise<ResolvedParticipant> {
  const holderName = input.holderName.trim();
  const holderEmail = input.holderEmail.trim();
  const block = input.participant ?? null;
  const blockName = cleanName(block?.name) || cleanName(input.defaultName);
  const blockRelationship = isRelationship(block?.relationship)
    ? block.relationship
    : null;
  const selfLevel =
    typeof block?.selfLevel === "string" && block.selfLevel.trim()
      ? block.selfLevel.trim()
      : null;

  const fallback: ResolvedParticipant = {
    accountId: null,
    participantId: null,
    participantName: blockName || holderName,
    relationship: blockRelationship ?? "",
    accountName: holderName,
    accountEmail: holderEmail,
    selfLevel,
    accountCreated: false,
  };

  // ── Signed in: pick from your own people, never anyone else's ──────────────
  if (input.signedInUserId) {
    const accountId = input.signedInUserId;
    const account = await getAccount(accountId).catch(() => null);
    const requested =
      typeof input.participantId === "string" && input.participantId.trim()
        ? input.participantId.trim()
        : null;

    let participant = requested
      ? await getParticipant(requested).catch(() => null)
      : null;
    if (participant && participant.account_id !== accountId) participant = null;
    if (!participant) {
      participant = await ensureSelfParticipant(accountId, {
        fullName: account?.name ?? holderName,
      }).catch(() => null);
    }

    return {
      accountId,
      participantId: participant?.id ?? null,
      participantName:
        participant?.full_name?.trim() || account?.name?.trim() || holderName,
      relationship: participant?.relationship ?? "self",
      accountName: account?.name?.trim() || holderName,
      accountEmail: account?.email || holderEmail,
      selfLevel,
      accountCreated: false,
    };
  }

  if (!holderEmail) return fallback;

  // ── Signed out ────────────────────────────────────────────────────────────
  const isHolder =
    !blockRelationship ||
    blockRelationship === "self" ||
    (!!blockName && blockName.toLowerCase() === holderName.toLowerCase());

  let accountId = await findUserIdByEmail(holderEmail).catch(() => null);

  if (isHolder) {
    // Exactly the pre-household behaviour: with no account yet, the row rides
    // on the email and the participant is resolved when the account lands.
    if (!accountId) return { ...fallback, participantName: blockName || holderName };
    const self = await ensureSelfParticipant(accountId, {
      fullName: holderName || blockName,
    }).catch(() => null);
    const account = await getAccount(accountId).catch(() => null);
    return {
      accountId,
      participantId: self?.id ?? null,
      participantName: self?.full_name?.trim() || blockName || holderName,
      relationship: "self",
      accountName: account?.name?.trim() || holderName,
      accountEmail: account?.email || holderEmail,
      selfLevel,
      accountCreated: false,
    };
  }

  // Registering someone else: we need an account to hang them off.
  let accountCreated = false;
  if (!accountId) {
    const ensured = await ensureAccountForEmail(holderEmail);
    accountId = ensured.id;
    accountCreated = ensured.created;
  }
  if (!accountId) return fallback;

  await fillPlayerContact(accountId, {
    fullName: holderName || null,
    phone: input.holderPhone ?? null,
  }).catch(() => undefined);
  await ensureSelfParticipant(accountId, { fullName: holderName }).catch(() => null);

  const created = await createParticipant({
    accountId,
    fullName: blockName || "Player",
    relationship: blockRelationship,
    isMinor: block?.isMinor === true,
  });
  const account = await getAccount(accountId).catch(() => null);

  return {
    accountId,
    participantId: created.ok ? created.participant.id : null,
    participantName: blockName || holderName,
    relationship: blockRelationship,
    accountName: account?.name?.trim() || holderName,
    accountEmail: account?.email || holderEmail,
    selfLevel,
    accountCreated,
  };
}

/**
 * Resolve several people from one submission — the quiz and the enroll wizard
 * take a household at once. Signed in, `participantIds` are the chosen people;
 * signed out, `participants` are the typed blocks. Order is preserved so a
 * caller can pair each result with its own row.
 */
export async function resolveSubmissionParticipants(input: {
  signedInUserId?: string | null;
  participantIds?: unknown;
  participants?: ParticipantInput[] | null;
  holderName: string;
  holderEmail: string;
  holderPhone?: string | null;
}): Promise<ResolvedParticipant[]> {
  const ids = Array.isArray(input.participantIds)
    ? input.participantIds.filter((x): x is string => typeof x === "string" && !!x.trim())
    : [];
  const blocks = (input.participants ?? []).filter(
    (b) => cleanName(b?.name).length > 0
  );

  if (input.signedInUserId) {
    const list = ids.length > 0 ? ids : [null];
    const out: ResolvedParticipant[] = [];
    for (const id of list) {
      out.push(
        await resolveSubmissionParticipant({
          signedInUserId: input.signedInUserId,
          participantId: id,
          holderName: input.holderName,
          holderEmail: input.holderEmail,
          holderPhone: input.holderPhone,
        })
      );
    }
    return out;
  }

  const list: (ParticipantInput | null)[] = blocks.length > 0 ? blocks : [null];
  const out: ResolvedParticipant[] = [];
  // Sequential on purpose: the first block may be what provisions the account
  // the rest hang off.
  for (const block of list) {
    out.push(
      await resolveSubmissionParticipant({
        participant: block,
        holderName: input.holderName,
        holderEmail: input.holderEmail,
        holderPhone: input.holderPhone,
        defaultName: input.holderName,
      })
    );
  }
  return out;
}
