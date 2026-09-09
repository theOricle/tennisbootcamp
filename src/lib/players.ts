import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import {
  parseAvailability,
  hasAnyAvailability,
  isAvailabilitySource,
  type Availability,
  type AvailabilitySource,
} from "@/lib/availability";

// The one place level + availability are read from and written to.
//
// A "player" is a row in `participants` (migration 0007): one person who
// actually trains. One account holder can have several — themselves, their
// children, a spouse — all under a single auth user (`account_id`). Every
// caller (intake, request-a-time, assessment completion, admin players, the
// dashboard editor, the cohort matrix) goes through these functions and never
// names the table itself.
//
// `profiles` is still written for the 'self' participant during the
// transition, so anything that reads a profile directly keeps seeing the truth.
//
// Before 0007 is pasted into the Supabase SQL editor the participants table
// does not exist. Every read falls back to `profiles` and synthesizes one
// 'self' participant per account whose id IS the account id, so writes
// addressed to that id land on the profile row and the site behaves exactly as
// it did before this migration.

export const PLAYER_TABLE = "profiles";
export const PARTICIPANT_TABLE = "participants";

export const RELATIONSHIPS = ["self", "child", "spouse", "other"] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  self: "Myself",
  child: "My child",
  spouse: "My spouse or partner",
  other: "Someone else",
};

export function isRelationship(x: unknown): x is Relationship {
  return typeof x === "string" && (RELATIONSHIPS as readonly string[]).includes(x);
}

const PARTICIPANT_COLUMNS =
  "id, account_id, full_name, relationship, is_minor, level, level_assessed_at, " +
  "level_notes, availability, availability_updated_at, availability_source, " +
  "availability_note, created_at";

const PROFILE_COLUMNS =
  "id, full_name, phone, level, level_assessed_at, level_notes, " +
  "availability, availability_updated_at, availability_source, availability_note";

// Columns that exist before migration 0005. Reads fall back to these when the
// provenance columns are missing (42703 = undefined_column), so a deploy that
// lands before the SQL is pasted keeps the dashboard and admin list alive.
const PROFILE_BASE_COLUMNS =
  "id, full_name, phone, level, level_assessed_at, level_notes, availability";

type PgError = { code?: string; message?: string } | null;

function isUndefinedColumn(error: PgError): boolean {
  return (
    !!error &&
    (error.code === "42703" || /column .* does not exist/i.test(error.message ?? ""))
  );
}

/** 42P01 (undefined_table) / PostgREST PGRST205 — migration 0007 hasn't run. */
function isMissingTable(error: PgError): boolean {
  return (
    !!error &&
    (error.code === "42P01" ||
      error.code === "PGRST205" ||
      /relation .* does not exist/i.test(error.message ?? "") ||
      /could not find the table/i.test(error.message ?? ""))
  );
}

// ─── Records ──────────────────────────────────────────────────────────────────

export type PlayerRecord = {
  /** Participant id. On the pre-0007 fallback this is the account id. */
  id: string;
  account_id: string;
  full_name: string | null;
  relationship: Relationship;
  is_minor: boolean;
  /** Coach-assigned NTRP-style level, or null while unleveled. */
  level: number | null;
  level_assessed_at: string | null;
  level_notes: string | null;
  availability: Availability;
  availability_updated_at: string | null;
  availability_source: AvailabilitySource | null;
  availability_note: string | null;
};

/** The account holder behind one or more participants. */
export type AccountInfo = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
};

type RawParticipant = {
  id: string;
  account_id: string;
  full_name: string | null;
  relationship: string | null;
  is_minor: boolean | null;
  level: string | number | null;
  level_assessed_at: string | null;
  level_notes: string | null;
  availability: unknown;
  availability_updated_at?: string | null;
  availability_source?: string | null;
  availability_note?: string | null;
};

type RawProfile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  level: string | number | null;
  level_assessed_at: string | null;
  level_notes: string | null;
  availability: unknown;
  availability_updated_at?: string | null;
  availability_source?: string | null;
  availability_note?: string | null;
};

function numOrNull(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toRecord(row: RawParticipant): PlayerRecord {
  return {
    id: row.id,
    account_id: row.account_id,
    full_name: row.full_name,
    relationship: isRelationship(row.relationship) ? row.relationship : "other",
    is_minor: row.is_minor === true,
    level: numOrNull(row.level),
    level_assessed_at: row.level_assessed_at,
    level_notes: row.level_notes,
    availability: parseAvailability(row.availability),
    availability_updated_at: row.availability_updated_at ?? null,
    availability_source: isAvailabilitySource(row.availability_source)
      ? row.availability_source
      : null,
    availability_note: row.availability_note ?? null,
  };
}

/** Pre-0007 fallback: a profile row read as the account's single 'self' player. */
function profileToRecord(row: RawProfile): PlayerRecord {
  return {
    id: row.id,
    account_id: row.id,
    full_name: row.full_name,
    relationship: "self",
    is_minor: false,
    level: numOrNull(row.level),
    level_assessed_at: row.level_assessed_at,
    level_notes: row.level_notes,
    availability: parseAvailability(row.availability),
    availability_updated_at: row.availability_updated_at ?? null,
    availability_source: isAvailabilitySource(row.availability_source)
      ? row.availability_source
      : null,
    availability_note: row.availability_note ?? null,
  };
}

// ─── Pure helpers (admin list) ────────────────────────────────────────────────

export type PlayerView = "all" | "leveled" | "unleveled";
export type PlayerSort = "level" | "availability_updated_at";

/** True when the player has a coach-assigned level. */
export function isLeveled(p: Pick<PlayerRecord, "level">): boolean {
  return p.level !== null;
}

/** Pure filter for the admin view toggle. */
export function filterPlayersByView<T extends Pick<PlayerRecord, "level">>(
  players: T[],
  view: PlayerView
): T[] {
  if (view === "leveled") return players.filter(isLeveled);
  if (view === "unleveled") return players.filter((p) => !isLeveled(p));
  return players;
}

/**
 * Pure sort for the admin list. Nulls always sink to the bottom regardless of
 * direction, so an unleveled player never leads a "highest level first" list.
 */
export function sortPlayers<
  T extends Pick<PlayerRecord, "level" | "availability_updated_at">,
>(players: T[], sort: PlayerSort, dir: "asc" | "desc" = "desc"): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...players].sort((a, b) => {
    const av = sort === "level" ? a.level : a.availability_updated_at;
    const bv = sort === "level" ? b.level : b.availability_updated_at;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (av < bv) return -1 * sign;
    if (av > bv) return 1 * sign;
    return 0;
  });
}

// ─── Profile reads (the account holder's own row) ─────────────────────────────

async function readProfile(
  id: string,
  client: SupabaseClient
): Promise<RawProfile | null> {
  let { data, error } = await client
    .from(PLAYER_TABLE)
    .select(PROFILE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (isUndefinedColumn(error)) {
    ({ data, error } = await client
      .from(PLAYER_TABLE)
      .select(PROFILE_BASE_COLUMNS)
      .eq("id", id)
      .maybeSingle());
  }
  if (error) throw new Error(error.message);
  return (data as unknown as RawProfile | null) ?? null;
}

async function readAllProfiles(client: SupabaseClient): Promise<RawProfile[]> {
  let { data, error } = await client.from(PLAYER_TABLE).select(PROFILE_COLUMNS);
  if (isUndefinedColumn(error)) {
    ({ data, error } = await client.from(PLAYER_TABLE).select(PROFILE_BASE_COLUMNS));
  }
  if (error) throw new Error(error.message);
  return (data as unknown as RawProfile[]) ?? [];
}

// ─── Participant reads ────────────────────────────────────────────────────────

/** Every participant across every account (admins — the pool is small). */
export async function listPlayers(
  client: SupabaseClient = createServiceClient()
): Promise<PlayerRecord[]> {
  const { data, error } = await client
    .from(PARTICIPANT_TABLE)
    .select(PARTICIPANT_COLUMNS)
    .order("created_at", { ascending: true });
  if (isMissingTable(error)) {
    return (await readAllProfiles(client)).map(profileToRecord);
  }
  if (error) throw new Error(error.message);
  return ((data as unknown as RawParticipant[]) ?? []).map(toRecord);
}

/**
 * One account's people, 'self' first. `client` lets an RLS-scoped caller read
 * their own household with their session.
 */
export async function listParticipantsForAccount(
  accountId: string,
  client: SupabaseClient = createServiceClient()
): Promise<PlayerRecord[]> {
  const { data, error } = await client
    .from(PARTICIPANT_TABLE)
    .select(PARTICIPANT_COLUMNS)
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });
  if (isMissingTable(error)) {
    const profile = await readProfile(accountId, client);
    return profile ? [profileToRecord(profile)] : [];
  }
  if (error) throw new Error(error.message);
  const rows = ((data as unknown as RawParticipant[]) ?? []).map(toRecord);
  return [
    ...rows.filter((r) => r.relationship === "self"),
    ...rows.filter((r) => r.relationship !== "self"),
  ];
}

/** One participant by id, or null. */
export async function getParticipant(
  id: string,
  client: SupabaseClient = createServiceClient()
): Promise<PlayerRecord | null> {
  const { data, error } = await client
    .from(PARTICIPANT_TABLE)
    .select(PARTICIPANT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (isMissingTable(error)) {
    const profile = await readProfile(id, client);
    return profile ? profileToRecord(profile) : null;
  }
  if (error) throw new Error(error.message);
  return data ? toRecord(data as unknown as RawParticipant) : null;
}

/**
 * The account holder's own 'self' participant, or null when the account has no
 * participants yet.
 */
export async function getSelfParticipant(
  accountId: string,
  client: SupabaseClient = createServiceClient()
): Promise<PlayerRecord | null> {
  const { data, error } = await client
    .from(PARTICIPANT_TABLE)
    .select(PARTICIPANT_COLUMNS)
    .eq("account_id", accountId)
    .eq("relationship", "self")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (isMissingTable(error)) {
    const profile = await readProfile(accountId, client);
    return profile ? profileToRecord(profile) : null;
  }
  if (error) throw new Error(error.message);
  return data ? toRecord(data as unknown as RawParticipant) : null;
}

/**
 * The holder's 'self' participant, created if the account doesn't have one yet
 * (a brand-new sign-up, or a row the 0007 backfill couldn't reach). Returns
 * null only when participants aren't available at all — callers then fall back
 * to the account id, which is exactly what the pre-0007 code did.
 */
export async function ensureSelfParticipant(
  accountId: string,
  input: { fullName?: string | null } = {}
): Promise<PlayerRecord | null> {
  const existing = await getSelfParticipant(accountId).catch(() => null);
  if (existing) {
    // Fill a blank name once we learn it; never overwrite what's there.
    if (!existing.full_name?.trim() && input.fullName?.trim()) {
      const supabase = createServiceClient();
      await supabase
        .from(PARTICIPANT_TABLE)
        .update({ full_name: input.fullName.trim() })
        .eq("id", existing.id);
      return { ...existing, full_name: input.fullName.trim() };
    }
    return existing;
  }

  const created = await createParticipant({
    accountId,
    fullName: input.fullName?.trim() || "Account holder",
    relationship: "self",
    isMinor: false,
  });
  return created.ok ? created.participant : null;
}

/** Account holders by id — name and phone from the profile, email from auth. */
export async function listAccounts(): Promise<Map<string, AccountInfo>> {
  const supabase = createServiceClient();
  const [profiles, users] = await Promise.all([
    readAllProfiles(supabase).catch(() => [] as RawProfile[]),
    // Small project — one page of users covers everyone (same as assessments).
    supabase.auth.admin.listUsers({ page: 1, perPage: 200 }).then(
      (r) => r.data?.users ?? [],
      () => []
    ),
  ]);
  const byId = new Map<string, AccountInfo>();
  for (const p of profiles) {
    byId.set(p.id, { id: p.id, name: p.full_name, email: "", phone: p.phone });
  }
  for (const u of users) {
    const current = byId.get(u.id);
    byId.set(u.id, {
      id: u.id,
      name: current?.name ?? null,
      email: u.email ?? "",
      phone: current?.phone ?? null,
    });
  }
  return byId;
}

/**
 * The auth account for an email, created silently when there isn't one yet.
 *
 * No email is sent here — the flows keep their own "set your password"
 * moment (confirmBooking, createRequestedBooking, provisionIntakeAccount).
 * This only exists so a holder booking for their child has somewhere to hang
 * the child's participant row before payment.
 */
export async function ensureAccountForEmail(
  email: string
): Promise<{ id: string | null; created: boolean }> {
  const existing = await findUserIdByEmail(email).catch(() => null);
  if (existing) return { id: existing, created: false };
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      email_confirm: false,
    });
    if (error) {
      // Raced with another writer, most likely — look it up again.
      const id = await findUserIdByEmail(email).catch(() => null);
      return { id, created: false };
    }
    return { id: data.user?.id ?? null, created: Boolean(data.user?.id) };
  } catch (err) {
    console.error("ensureAccountForEmail failed (non-blocking):", err);
    return { id: null, created: false };
  }
}

/** One account holder: profile name/phone plus the auth email. */
export async function getAccount(accountId: string): Promise<AccountInfo | null> {
  const supabase = createServiceClient();
  const [profile, user] = await Promise.all([
    readProfile(accountId, supabase).catch(() => null),
    supabase.auth.admin.getUserById(accountId).then(
      (r) => r.data?.user ?? null,
      () => null
    ),
  ]);
  if (!profile && !user) return null;
  return {
    id: accountId,
    name: profile?.full_name ?? null,
    email: user?.email ?? "",
    phone: profile?.phone ?? null,
  };
}

/** Resolve an auth user id from an email (small project — one page covers everyone). */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const supabase = createServiceClient();
  const target = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error || !data) return null;
  const match = data.users.find(
    (u) => (u.email ?? "").trim().toLowerCase() === target
  );
  return match?.id ?? null;
}

// ─── Participant writes ───────────────────────────────────────────────────────

export async function createParticipant(input: {
  accountId: string;
  fullName: string;
  relationship: Relationship;
  isMinor?: boolean;
}): Promise<
  { ok: true; participant: PlayerRecord } | { ok: false; error: string }
> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(PARTICIPANT_TABLE)
    .insert({
      account_id: input.accountId,
      full_name: input.fullName.trim(),
      relationship: input.relationship,
      is_minor: input.isMinor === true,
    })
    .select(PARTICIPANT_COLUMNS)
    .single();
  if (isMissingTable(error)) {
    return {
      ok: false,
      error: "Multiple people per account isn't switched on yet (migration 0007).",
    };
  }
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not add that person." };
  }
  return { ok: true, participant: toRecord(data as unknown as RawParticipant) };
}

/**
 * Apply a patch to a participant, mirroring the same columns onto the holder's
 * profile when the participant is the holder themselves. On the pre-0007
 * fallback the id IS the account id, so the write lands on the profile.
 */
async function patchParticipant(
  id: string,
  patch: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(PARTICIPANT_TABLE)
    .update(patch)
    .eq("id", id)
    .select("account_id, relationship")
    .maybeSingle();

  if (isMissingTable(error)) {
    const { error: profileErr } = await supabase
      .from(PLAYER_TABLE)
      .upsert({ id, ...patch }, { onConflict: "id" });
    return profileErr ? { ok: false, error: profileErr.message } : { ok: true };
  }
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Player not found." };

  const row = data as { account_id: string; relationship: string };
  if (row.relationship === "self") {
    // Keep the profile in sync for the holder during the transition.
    const { error: mirrorErr } = await supabase
      .from(PLAYER_TABLE)
      .upsert({ id: row.account_id, ...patch }, { onConflict: "id" });
    if (mirrorErr) {
      console.warn("Profile mirror failed (non-blocking):", mirrorErr.message);
    }
  }
  return { ok: true };
}

/** Coach sets (or corrects) the level. Stamps level_assessed_at. */
export async function setPlayerLevel(
  id: string,
  input: { level: number; notes?: string }
): Promise<{ ok: boolean; error?: string }> {
  const patch: Record<string, unknown> = {
    level: input.level,
    level_assessed_at: new Date().toISOString(),
  };
  if (input.notes !== undefined) patch.level_notes = input.notes;
  return patchParticipant(id, patch);
}

/** Coach note only (no level change). */
export async function setPlayerLevelNotes(
  id: string,
  notes: string
): Promise<{ ok: boolean; error?: string }> {
  return patchParticipant(id, { level_notes: notes });
}

/**
 * Write availability with its provenance. `note` is the optional one-liner from
 * the dashboard editor; pass undefined to leave it untouched.
 */
export async function setPlayerAvailability(
  id: string,
  input: {
    availability: unknown;
    source: AvailabilitySource;
    note?: string | null;
  }
): Promise<{ ok: boolean; error?: string }> {
  const patch: Record<string, unknown> = {
    availability: parseAvailability(input.availability),
    availability_updated_at: new Date().toISOString(),
    availability_source: input.source,
  };
  if (input.note !== undefined) patch.availability_note = input.note;
  return patchParticipant(id, patch);
}

/** Fill a blank name/phone on the account holder's profile; never overwrites. */
export async function fillPlayerContact(
  accountId: string,
  input: { fullName?: string | null; phone?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServiceClient();
  const current = await readProfile(accountId, supabase).catch(() => null);
  const patch: Record<string, unknown> = { id: accountId };
  if (input.fullName && !current?.full_name) patch.full_name = input.fullName;
  if (input.phone && !current?.phone) patch.phone = input.phone;
  if (Object.keys(patch).length === 1) return { ok: true };
  const { error } = await supabase
    .from(PLAYER_TABLE)
    .upsert(patch, { onConflict: "id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ─── Resolution: who is this row for? ─────────────────────────────────────────

/**
 * The participant a booking / invite / intake row belongs to.
 *
 * Order: an explicit participant_id wins; otherwise the account is resolved
 * from the email and the holder's 'self' participant is used (created if the
 * account doesn't have one yet). Returns null when there's no account to hang
 * a participant off — the row keeps working on email alone, exactly as before.
 */
export async function resolveParticipantId(input: {
  participantId?: string | null;
  accountId?: string | null;
  email?: string | null;
  fullName?: string | null;
}): Promise<string | null> {
  if (input.participantId) {
    const found = await getParticipant(input.participantId).catch(() => null);
    if (found) return found.id;
  }
  let accountId = input.accountId ?? null;
  if (!accountId && input.email) {
    accountId = await findUserIdByEmail(input.email).catch(() => null);
  }
  if (!accountId) return null;
  const self = await ensureSelfParticipant(accountId, {
    fullName: input.fullName ?? null,
  }).catch(() => null);
  return self?.id ?? null;
}

/**
 * Availability write addressed by email (or by an explicit participant).
 * Skips silently when the grid is empty (never wipe what's on file with
 * nothing) or when there's no participant to write to yet.
 * `onlyIfOlderThan` keeps a snapshot from overwriting a newer confirmation:
 * the write happens only when the participant's availability is missing or was
 * stamped before that instant.
 */
export async function setPlayerAvailabilityByEmail(
  email: string,
  input: {
    availability: unknown;
    source: AvailabilitySource;
    participantId?: string | null;
    fullName?: string | null;
    phone?: string | null;
    onlyIfOlderThan?: string | null;
  }
): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  if (!hasAnyAvailability(input.availability)) {
    return { ok: true, skipped: "empty grid" };
  }
  const participantId = await resolveParticipantId({
    participantId: input.participantId,
    email,
    fullName: input.fullName,
  });
  if (!participantId) return { ok: true, skipped: "no account for email" };

  const current = await getParticipant(participantId).catch(() => null);
  if (input.onlyIfOlderThan) {
    const stamped = current?.availability_updated_at;
    if (
      stamped &&
      hasAnyAvailability(current?.availability) &&
      stamped > input.onlyIfOlderThan
    ) {
      return { ok: true, skipped: "player availability is newer" };
    }
  }

  // Name and phone fill blanks on the holder's profile only — a player's own
  // profile edits win.
  if (current?.account_id && (input.fullName || input.phone)) {
    await fillPlayerContact(current.account_id, {
      fullName: input.fullName ?? null,
      phone: input.phone ?? null,
    }).catch(() => undefined);
  }

  return setPlayerAvailability(participantId, {
    availability: input.availability,
    source: input.source,
  });
}
