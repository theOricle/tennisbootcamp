import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ageBandToWho, isAgeBand } from "@/lib/ageBand";
import { selfEstimateToLevel } from "@/lib/level";
import {
  ensureSelfParticipant,
  ensureAccountForEmail,
  createParticipant,
  getParticipant,
  getAccount,
  findUserIdByEmail,
  fillPlayerContact,
  isRelationship,
  listParticipantsForAccount,
  type Relationship,
} from "@/lib/players";
import {
  cleanParticipantName,
  findExistingParticipant,
  newParticipantInput,
  plannedAdditions,
  type ParticipantInput,
} from "@/lib/participantInput";

// "Who is this for?" resolved on the server (backlog #11).
//
// Every public form now asks who a submission is about. This module turns that
// answer into a participant id the flow can carry, whether the visitor is
// signed in (pick from their people) or not (type a person in).
//
// The rules:
//   • A signed-in holder may only name a participant on their own account.
//   • A signed-in holder may also add someone (backlog #24): a typed block
//     becomes a participant under the session's account — the same create
//     the guest path uses, and never an account the request body names.
//   • A guest booking for themselves behaves exactly as it did before — the
//     participant is resolved (or created) when their account is provisioned.
//   • A guest booking for someone else needs an account to hang that person
//     off, so one is created silently here. No email is sent from this module;
//     each flow keeps its own "set your password" moment.

export type { ParticipantInput };

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
   * This player's own answers as Sheet columns 5–6 spell them. Null when the
   * submission never named an age band (a signed-in pick, an older client) —
   * the caller then falls back to the submission-level values, as before.
   */
  legacyWho: "adult" | "youth" | null;
  legacyLevel: string | null;
  /**
   * True when this resolution had to create the auth account itself (a guest
   * registering someone else). The flow still owes them a set-password email.
   */
  accountCreated: boolean;
};

const cleanName = cleanParticipantName;

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
  /**
   * Signed in, let a typed block create someone on the session's account
   * (backlog #24). Only the quiz's resolveSubmissionParticipants sets this;
   * booking and enroll leave it off and behave exactly as before.
   */
  allowCreate?: boolean;
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
  const ageBand = isAgeBand(block?.ageBand) ? block.ageBand : null;
  const own = {
    legacyWho: ageBand ? ageBandToWho(ageBand) : null,
    legacyLevel: ageBand ? (selfEstimateToLevel(selfLevel) ?? "") : null,
  };

  const fallback: ResolvedParticipant = {
    accountId: null,
    participantId: null,
    participantName: blockName || holderName,
    relationship: blockRelationship ?? "",
    accountName: holderName,
    accountEmail: holderEmail,
    selfLevel,
    ...own,
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

    // Adding someone (backlog #24): only when the caller allows it (the quiz
    // does; booking and enroll never do), no id, and a typed block naming a
    // person other than the holder. The create is the guest path's create,
    // and the account is the session's — `accountId` here is
    // `input.signedInUserId`, never a value from the body. Before creating,
    // the holder's own people are checked for the same name and relationship
    // so a retried or re-run quiz reuses them instead of making a twin. A
    // create that fails (the per-household cap above all) is reported as
    // unresolved (participantId null, the typed name on the row) rather than
    // quietly becoming a row about the holder.
    const addition =
      input.allowCreate && !requested ? newParticipantInput(accountId, block) : null;
    if (!participant && addition) {
      await ensureSelfParticipant(accountId, {
        fullName: account?.name ?? holderName,
      }).catch(() => null);
      const existing = await listParticipantsForAccount(accountId).catch(() => []);
      const twin = findExistingParticipant(existing, addition);
      const created = twin
        ? { ok: true as const, participant: twin }
        : await createParticipant(addition).catch(() => null);
      if (created?.ok) {
        participant = created.participant;
      } else {
        console.error(
          "Could not add a participant from the quiz (non-blocking):",
          created && !created.ok ? created.error : "unknown"
        );
        return {
          accountId,
          participantId: null,
          participantName: addition.fullName,
          relationship: addition.relationship,
          accountName: account?.name?.trim() || holderName,
          accountEmail: account?.email || holderEmail,
          selfLevel,
          ...own,
          accountCreated: false,
        };
      }
    }

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
      ...own,
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
      ...own,
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

  // The same create the signed-in add uses (backlog #24); the name fallback
  // and the account it lands on are exactly what they were.
  const created = await createParticipant(
    newParticipantInput(accountId, { ...block, name: blockName || "Player" }) ?? {
      accountId,
      fullName: blockName || "Player",
      relationship: blockRelationship,
      isMinor: block?.isMinor === true,
    }
  );
  const account = await getAccount(accountId).catch(() => null);

  return {
    accountId,
    participantId: created.ok ? created.participant.id : null,
    participantName: blockName || holderName,
    relationship: blockRelationship,
    accountName: account?.name?.trim() || holderName,
    accountEmail: account?.email || holderEmail,
    selfLevel,
    ...own,
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
  /**
   * Signed in, the chooser sends ids rather than blocks, so each player's own
   * age band and self-estimate arrive here keyed by participant id.
   */
  participantProfiles?: unknown;
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
    const profiles =
      input.participantProfiles &&
      typeof input.participantProfiles === "object" &&
      !Array.isArray(input.participantProfiles)
        ? (input.participantProfiles as Record<string, ParticipantInput>)
        : {};
    // Chosen people first, then anyone the holder is adding (backlog #24).
    // An addition is a typed block with no id; it is created under
    // `input.signedInUserId` inside resolveSubmissionParticipant. A block
    // naming nobody, or naming the holder, adds no one — the holder is picked
    // from the list, never created twice.
    const entries: { id: string | null; block: ParticipantInput | null }[] = [
      // The signed-in branch takes the name and relationship from the
      // participant row; only the age band and self-estimate come from here.
      ...ids.map((id) => ({ id, block: profiles[id] ?? null })),
      ...plannedAdditions(input.signedInUserId, input.participants).map((a) => ({
        id: null,
        block: a.block,
      })),
    ];
    if (entries.length === 0) entries.push({ id: null, block: null });
    const out: ResolvedParticipant[] = [];
    // Sequential on purpose: each create lands before the next is attempted.
    for (const entry of entries) {
      out.push(
        await resolveSubmissionParticipant({
          signedInUserId: input.signedInUserId,
          participantId: entry.id,
          participant: entry.block,
          holderName: input.holderName,
          holderEmail: input.holderEmail,
          holderPhone: input.holderPhone,
          // The quiz is the one flow that adds people on the fly.
          allowCreate: entry.id === null && entry.block !== null,
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
