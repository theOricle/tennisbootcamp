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
// Today a "player" is a row in `profiles` (keyed by the auth user id). If a
// dedicated participants table replaces it later, rename PLAYER_TABLE and
// adjust the column map here — every caller (intake, request-a-time,
// assessment completion, admin players, the dashboard editor, the cohort
// matrix) goes through these functions and never names the table itself.

export const PLAYER_TABLE = "profiles";

const PLAYER_COLUMNS =
  "id, full_name, phone, level, level_assessed_at, level_notes, " +
  "availability, availability_updated_at, availability_source, availability_note";

// Columns that exist before migration 0005. Reads fall back to these when the
// provenance columns are missing (42703 = undefined_column), so a deploy that
// lands before the SQL is pasted keeps the dashboard and admin list alive.
const BASE_COLUMNS =
  "id, full_name, phone, level, level_assessed_at, level_notes, availability";

function isUndefinedColumn(error: { code?: string; message?: string } | null): boolean {
  return (
    !!error &&
    (error.code === "42703" || /column .* does not exist/i.test(error.message ?? ""))
  );
}

export type PlayerRecord = {
  id: string;
  full_name: string | null;
  phone: string | null;
  /** Coach-assigned NTRP-style level, or null while unleveled. */
  level: number | null;
  level_assessed_at: string | null;
  level_notes: string | null;
  availability: Availability;
  availability_updated_at: string | null;
  availability_source: AvailabilitySource | null;
  availability_note: string | null;
};

type RawRow = {
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

export type PlayerView = "all" | "leveled" | "unleveled";
export type PlayerSort = "level" | "availability_updated_at";

function toRecord(row: RawRow): PlayerRecord {
  const level =
    row.level === null || row.level === undefined || row.level === ""
      ? null
      : Number(row.level);
  return {
    id: row.id,
    full_name: row.full_name,
    phone: row.phone,
    level: level !== null && Number.isFinite(level) ? level : null,
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

/** Every player row (admins included — the pool is small). */
export async function listPlayers(
  client: SupabaseClient = createServiceClient()
): Promise<PlayerRecord[]> {
  let { data, error } = await client.from(PLAYER_TABLE).select(PLAYER_COLUMNS);
  if (isUndefinedColumn(error)) {
    ({ data, error } = await client.from(PLAYER_TABLE).select(BASE_COLUMNS));
  }
  if (error) throw new Error(error.message);
  return ((data as unknown as RawRow[]) ?? []).map(toRecord);
}

/** One player by user id, or null. `client` lets RLS-scoped callers read their own row. */
export async function getPlayer(
  id: string,
  client: SupabaseClient = createServiceClient()
): Promise<PlayerRecord | null> {
  let { data, error } = await client
    .from(PLAYER_TABLE)
    .select(PLAYER_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (isUndefinedColumn(error)) {
    ({ data, error } = await client
      .from(PLAYER_TABLE)
      .select(BASE_COLUMNS)
      .eq("id", id)
      .maybeSingle());
  }
  if (error) throw new Error(error.message);
  return data ? toRecord(data as unknown as RawRow) : null;
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

/** Coach sets (or corrects) the level. Stamps level_assessed_at. */
export async function setPlayerLevel(
  id: string,
  input: { level: number; notes?: string }
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServiceClient();
  const patch: Record<string, unknown> = {
    level: input.level,
    level_assessed_at: new Date().toISOString(),
  };
  if (input.notes !== undefined) patch.level_notes = input.notes;
  const { error } = await supabase.from(PLAYER_TABLE).update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Coach note only (no level change). */
export async function setPlayerLevelNotes(
  id: string,
  notes: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from(PLAYER_TABLE)
    .update({ level_notes: notes })
    .eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Fill a blank name/phone on the profile; never overwrites what's there. */
export async function fillPlayerContact(
  id: string,
  input: { fullName?: string | null; phone?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  const current = await getPlayer(id).catch(() => null);
  const patch: Record<string, unknown> = { id };
  if (input.fullName && !current?.full_name) patch.full_name = input.fullName;
  if (input.phone && !current?.phone) patch.phone = input.phone;
  if (Object.keys(patch).length === 1) return { ok: true };
  const supabase = createServiceClient();
  const { error } = await supabase
    .from(PLAYER_TABLE)
    .upsert(patch, { onConflict: "id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Write availability with its provenance. Upserts on id so a profile row that
 * the auth trigger hasn't created yet still lands. `note` is the optional
 * one-liner from the dashboard editor; pass undefined to leave it untouched.
 */
export async function setPlayerAvailability(
  id: string,
  input: {
    availability: unknown;
    source: AvailabilitySource;
    note?: string | null;
    fullName?: string | null;
    phone?: string | null;
  }
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServiceClient();
  const patch: Record<string, unknown> = {
    id,
    availability: parseAvailability(input.availability),
    availability_updated_at: new Date().toISOString(),
    availability_source: input.source,
  };
  if (input.note !== undefined) patch.availability_note = input.note;
  if (input.fullName) patch.full_name = input.fullName;
  if (input.phone) patch.phone = input.phone;
  const { error } = await supabase
    .from(PLAYER_TABLE)
    .upsert(patch, { onConflict: "id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Same write, addressed by email. Skips silently when no auth user exists for
 * the email (nothing to attach to yet) or the grid is empty (never wipe what's
 * on file with nothing). `onlyIfOlderThan` keeps a snapshot from overwriting a
 * newer confirmation: the write happens only when the profile's availability
 * is missing or was stamped before that instant.
 */
export async function setPlayerAvailabilityByEmail(
  email: string,
  input: {
    availability: unknown;
    source: AvailabilitySource;
    fullName?: string | null;
    phone?: string | null;
    onlyIfOlderThan?: string | null;
  }
): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  if (!hasAnyAvailability(input.availability)) {
    return { ok: true, skipped: "empty grid" };
  }
  const id = await findUserIdByEmail(email);
  if (!id) return { ok: true, skipped: "no account for email" };

  const current = await getPlayer(id).catch(() => null);
  if (input.onlyIfOlderThan) {
    const stamped = current?.availability_updated_at;
    if (
      stamped &&
      hasAnyAvailability(current?.availability) &&
      stamped > input.onlyIfOlderThan
    ) {
      return { ok: true, skipped: "profile availability is newer" };
    }
  }

  // Name and phone fill blanks only — a player's own profile edits win.
  return setPlayerAvailability(id, {
    availability: input.availability,
    source: input.source,
    fullName: current?.full_name ? null : input.fullName,
    phone: current?.phone ? null : input.phone,
  });
}
