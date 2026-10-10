"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AvailabilityGrid,
  AvailabilityHoursLegend,
} from "@/components/ui/AvailabilityGrid";
import { TierChip } from "@/components/tiers";
import { LEVEL_OPTIONS, TIERS } from "@/lib/tiers";
import { AGE_BAND_LABELS, isAgeBand } from "@/lib/ageBand";
import { COHORT_STATUS_LABELS, programTitleFor, selfEstimateLine, statusLabel } from "@/lib/adminLabels";
import { inviteNotice } from "@/lib/emailResult";
import {
  AVAILABILITY_SOURCE_LABELS,
  type Availability,
  type AvailabilitySource,
} from "@/lib/availability";

type Player = {
  /** Participant id — the person, not the account. */
  id: string;
  name: string | null;
  relationship: string;
  relationshipLabel: string;
  isMinor: boolean;
  /** The account holder this player belongs to. */
  account: { id: string; name: string | null; email: string };
  email: string;
  phone: string | null;
  level: number | null;
  level_assessed_at: string | null;
  level_notes: string | null;
  availability: Availability;
  availability_chips: string[];
  availability_updated_at: string | null;
  availability_source: AvailabilitySource | null;
  availability_note: string | null;
  /** Migration 0009 (audit L20): null before it runs, or when never asked. */
  ageBand?: string | null;
  selfLevel?: string | null;
  /** A holder who only registered someone else (audit M26). */
  accountOnly?: boolean;
};

/** A cohort the coach can invite into from here (draft or inviting). */
type InviteTarget = { id: string; label: string; programId: string; dbStatus?: string };

type View = "all" | "leveled" | "unleveled";
type Sort = "level" | "availability_updated_at";

// "Unranked" is the one no-level word, in admin as on the site (audit M29).
const VIEW_LABELS: Record<View, string> = {
  all: "All",
  leveled: "Leveled",
  unleveled: "Unranked",
};

const inputClass =
  "w-full rounded-lg border border-white/35 bg-white/5 px-3 py-2.5 text-base text-white " +
  "placeholder:text-white/45 focus:border-[#B4E655]/60 focus:outline-none focus:ring-2 focus:ring-[#B4E655]/30";

const chipClass = (active: boolean) =>
  `min-h-[44px] shrink-0 snap-start rounded-full px-4 text-sm font-semibold transition ${
    active
      ? "bg-[#B4E655] text-[#061427]"
      : "border border-white/20 text-white/70 hover:text-white"
  }`;

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
}

function availabilityStatus(p: Player): string {
  if (!p.availability_updated_at) {
    return p.availability_chips.length > 0 ? "Availability on file" : "No availability yet";
  }
  const who = p.availability_source
    ? AVAILABILITY_SOURCE_LABELS[p.availability_source]
    : "on file";
  return `Availability ${who} · ${fmtDate(p.availability_updated_at)}`;
}

function PlayerCard({
  player,
  onChanged,
  ticked,
  onTick,
}: {
  player: Player;
  onChanged: () => void;
  /** Ticked for an invite (audit M28); undefined = no tick box. */
  ticked?: boolean;
  onTick?: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Unranked players start with no selection: the coach picks the level.
  const [level, setLevel] = useState(
    player.level != null ? player.level.toFixed(1) : ""
  );
  const [notes, setNotes] = useState(player.level_notes ?? "");
  const [availability, setAvailability] = useState<Availability>(
    player.availability
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      // Only send what changed: an untouched grid must not re-stamp the
      // availability provenance, and a blank level leaves it unranked.
      const payload: Record<string, unknown> = { id: player.id, levelNotes: notes.trim() };
      if (level) payload.level = Number(level);
      if (JSON.stringify(availability) !== JSON.stringify(player.availability)) {
        payload.availability = availability;
      }
      const res = await fetch("/api/admin/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Save failed.");
        setBusy(false);
        return;
      }
      setOpen(false);
      onChanged();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  const displayName = player.name || player.email || "Player";
  const ageLabel = isAgeBand(player.ageBand) ? AGE_BAND_LABELS[player.ageBand] : player.isMinor ? "Under 18" : null;
  const quiz = selfEstimateLine(player.selfLevel, { self: player.relationship === "self" });

  return (
    <div className={`rounded-xl border bg-white/5 p-4 ${ticked ? "border-[#B4E655]/50" : "border-white/10"}`}>
      <div className="flex items-start gap-3">
      {onTick && (
        <button
          type="button"
          role="checkbox"
          aria-checked={Boolean(ticked)}
          aria-label={`Invite ${displayName}`}
          onClick={onTick}
          className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50"
        >
          <span
            aria-hidden="true"
            className={`flex h-5 w-5 items-center justify-center rounded-sm border text-xs font-bold ${
              ticked ? "border-[#B4E655] bg-[#B4E655] text-[#061427]" : "border-white/45"
            }`}
          >
            {ticked ? "✓" : ""}
          </span>
        </button>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[44px] min-w-0 flex-1 items-start justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{displayName}</p>
          {/* Age band and the player's own read on their game (audit L20). */}
          {(ageLabel || player.accountOnly) && (
            <p className="mt-1 flex flex-wrap gap-1.5">
              {ageLabel && (
                <span className="inline-flex min-h-6 items-center rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-white/85">
                  {ageLabel}
                </span>
              )}
              {player.accountOnly && (
                <span className="inline-flex min-h-6 items-center rounded-full border border-dashed border-white/25 px-2.5 py-0.5 text-xs font-medium text-white/75">
                  Account holder only
                </span>
              )}
            </p>
          )}
          {/* Account: two players with the same name under different holders
              are told apart here. */}
          <p className="truncate text-xs text-white/60">
            <span className="text-white/60">Account: </span>
            {player.account.name || player.account.email || "—"}
            {player.account.email ? ` · ${player.account.email}` : ""}
          </p>
          {player.relationship !== "self" && player.relationshipLabel && (
            <p className="text-xs text-white/60">{player.relationshipLabel}</p>
          )}
          {player.phone && <p className="text-xs text-white/60">{player.phone}</p>}
          {quiz && <p className="mt-1 text-xs text-white/75">{quiz}</p>}
          <p className="mt-1 text-xs text-white/60">{availabilityStatus(player)}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="flex items-center justify-end gap-2">
            {/* "Deuce · 3.0", or the Unranked tag while no level is set. */}
            <TierChip level={player.level} showLevel />
          </div>
          {player.level_assessed_at && (
            <p className="mt-1 text-xs text-white/60">
              Assessed {fmtDate(player.level_assessed_at)}
            </p>
          )}
        </div>
      </button>
      </div>

      {!open && (
        <>
          {player.availability_chips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {player.availability_chips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/70"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
          {player.availability_note && (
            <p className="mt-2 text-xs italic text-white/55">
              &ldquo;{player.availability_note}&rdquo;
            </p>
          )}
        </>
      )}

      {open && (
        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
          <div className="grid grid-cols-[auto_1fr] items-center gap-3">
            <label htmlFor={`level-${player.id}`} className="text-sm text-white/70">
              Level
            </label>
            <select
              id={`level-${player.id}`}
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className={inputClass}
            >
              <option value="" className="bg-[#061427]">
                {player.level != null ? "—" : "Pick a level"}
              </option>
              {LEVEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-[#061427]">
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <label htmlFor={`notes-${player.id}`} className="sr-only">
            Coach note
          </label>
          <textarea
            id={`notes-${player.id}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Coach note on their game…"
            className={inputClass}
          />
          <div>
            <p className="mb-2 text-xs text-white/60">Weekly availability</p>
            <AvailabilityHoursLegend className="mb-2" />
            <AvailabilityGrid value={availability} onChange={setAvailability} />
            {player.availability_note && (
              <p className="mt-2 text-xs italic text-white/55">
                Player note: &ldquo;{player.availability_note}&rdquo;
              </p>
            )}
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="min-h-[44px] flex-1 rounded-full bg-[#B4E655] px-4 py-2 text-sm font-semibold text-[#061427] transition hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "Saving…" : player.level == null && level ? "Set level" : "Save changes"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
              className="min-h-[44px] rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/70 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminPlayersClient() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [counts, setCounts] = useState<Record<View, number>>({ all: 0, leveled: 0, unleveled: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>("all");
  const [sort, setSort] = useState<Sort>("level");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [band, setBand] = useState<string>("all"); // "all" | tier id "1".."7"
  // Sticky search (audit L20): name, account name or email.
  const [query, setQuery] = useState("");
  // Invite from the pool (audit M28): tick players, pick a cohort, send.
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const [targets, setTargets] = useState<InviteTarget[]>([]);
  const [targetId, setTargetId] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteNote, setInviteNote] = useState<string | null>(null);

  // Cohorts that can take invites right now.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/cohorts")
      .then((r) => (r.ok ? r.json() : { cohorts: [] }))
      .then((data) => {
        if (cancelled) return;
        const open = ((data.cohorts ?? []) as InviteTarget[]).filter((c) =>
          ["draft", "inviting"].includes(c.dbStatus ?? "")
        );
        setTargets(open);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleTick(id: string) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setInviteNote(null);
  }

  async function sendInvites() {
    if (ticked.size === 0) return;
    if (!targetId) {
      setInviteError("Pick the cohort to invite them to.");
      return;
    }
    setInviteBusy(true);
    setInviteError(null);
    setInviteNote(null);
    try {
      const res = await fetch(`/api/admin/cohorts/${encodeURIComponent(targetId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invite", participantIds: [...ticked] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInviteError(typeof data.error === "string" ? data.error : "Invites failed.");
        return;
      }
      const created: number = data.sent ?? 0;
      const emailed: number = data.emailed ?? created;
      const message = inviteNotice({
        created,
        emailed,
        errors: Array.isArray(data.errors) ? data.errors : [],
      });
      if (emailed < created) setInviteError(message);
      else setInviteNote(message);
      setTicked(new Set());
    } catch {
      setInviteError("Network error.");
    } finally {
      setInviteBusy(false);
    }
  }

  const refresh = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ view, sort, dir });
      const res = await fetch(`/api/admin/players?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error ?? "Failed to load players.");
        return;
      }
      setLoadError(null);
      setPlayers(data.players ?? []);
      if (data.counts) setCounts(data.counts);
    } catch {
      setLoadError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [view, sort, dir]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function toggleSort(next: Sort) {
    if (sort === next) {
      setDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSort(next);
      setDir("desc");
    }
  }

  // Tier band chips only make sense over leveled players.
  const byBand =
    band === "all"
      ? players
      : players.filter(
          (p) =>
            p.level != null &&
            Math.min(7, Math.max(1, Math.floor(p.level))) === Number(band)
        );
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? byBand.filter((p) =>
        [p.name, p.account.name, p.account.email, p.email]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle))
      )
    : byBand;

  const arrow = dir === "desc" ? "↓" : "↑";

  return (
    <div className="space-y-4">
      {/* Sticky search (audit L20) */}
      <div className="sticky top-[69px] z-10 -mx-1 bg-[#061427] px-1 py-2">
        <label htmlFor="player-search" className="sr-only">
          Search players
        </label>
        <input
          id="player-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by player, account or email"
          autoComplete="off"
          className={inputClass}
        />
      </div>

      {/* View toggle — All / Leveled / Unranked (the API view stays `unleveled`) */}
      <div className="flex gap-2" role="group" aria-label="View">
        {(["all", "leveled", "unleveled"] as View[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={chipClass(view === v)}
          >
            {VIEW_LABELS[v]}
            <span className={`ml-1.5 text-xs ${view === v ? "text-[#061427]/70" : "text-white/60"}`}>
              {counts[v]}
            </span>
          </button>
        ))}
      </div>

      {/* Sort */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
        <span>Sort by</span>
        <button
          type="button"
          onClick={() => toggleSort("level")}
          className={`min-h-[44px] rounded-full px-3 font-semibold transition ${
            sort === "level" ? "text-[#B4E655]" : "text-white/60 hover:text-white"
          }`}
        >
          Level {sort === "level" ? arrow : ""}
        </button>
        <button
          type="button"
          onClick={() => toggleSort("availability_updated_at")}
          className={`min-h-[44px] rounded-full px-3 font-semibold transition ${
            sort === "availability_updated_at" ? "text-[#B4E655]" : "text-white/60 hover:text-white"
          }`}
        >
          Availability updated {sort === "availability_updated_at" ? arrow : ""}
        </button>
      </div>

      {/* Level-band filter — one chip per tier (leveled players only) */}
      {view !== "unleveled" && (
        <div className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button type="button" onClick={() => setBand("all")} className={chipClass(band === "all")}>
            Any tier
          </button>
          {TIERS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setBand(String(t.id))}
              className={chipClass(band === String(t.id))}
            >
              {t.name} · {t.band}
            </button>
          ))}
        </div>
      )}

      {loading && <p className="text-sm text-white/60">Loading…</p>}
      {loadError && <p className="text-sm text-red-300">{loadError}</p>}
      {!loading && !loadError && filtered.length === 0 && (
        <p className="text-sm text-white/60">
          {view === "unleveled"
            ? "Nobody is unranked. New quiz sign-ups and assessment requests land here."
            : view === "leveled"
            ? `No leveled players${band === "all" ? " yet" : " in this band"}. Completed assessments and levels you set here land in this list.`
            : "No players yet. Quiz sign-ups, assessment requests and completed assessments all land here."}
        </p>
      )}
      {needle && !loading && !loadError && filtered.length === 0 && players.length > 0 && (
        <p className="text-sm text-white/60">No player matches &ldquo;{query.trim()}&rdquo;.</p>
      )}
      {filtered.map((p) => (
        <PlayerCard
          key={p.id}
          player={p}
          onChanged={refresh}
          ticked={ticked.has(p.id)}
          onTick={p.accountOnly ? undefined : () => toggleTick(p.id)}
        />
      ))}

      {/* The invite bar (audit M28): ticked players, the cohort, one send.
          Each invite carries the player's id, so a child's spot and $20
          credit are the child's. */}
      {(ticked.size > 0 || inviteNote || inviteError) && (
        <div className="sticky bottom-3 z-10 space-y-2 rounded-2xl border border-[#B4E655]/30 bg-[#0B1C33] p-4">
          {ticked.size > 0 && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[12rem] flex-1">
                <label htmlFor="invite-cohort" className="mb-1 block text-xs text-white/70">
                  Invite {ticked.size} player{ticked.size === 1 ? "" : "s"} to
                </label>
                <select
                  id="invite-cohort"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className={inputClass}
                >
                  <option value="" className="bg-[#061427]">
                    {targets.length === 0 ? "No draft or inviting cohorts" : "Pick a cohort…"}
                  </option>
                  {targets.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#061427]">
                      {programTitleFor(c.programId)} · {c.label} ({statusLabel(COHORT_STATUS_LABELS, c.dbStatus)})
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={inviteBusy || !targetId}
                onClick={() => void sendInvites()}
                className="min-h-[44px] rounded-full bg-[#B4E655] px-5 text-sm font-semibold text-[#061427] transition hover:brightness-110 disabled:opacity-40"
              >
                {inviteBusy ? "Sending…" : "Send invites (48h hold)"}
              </button>
              <button
                type="button"
                disabled={inviteBusy}
                onClick={() => setTicked(new Set())}
                className="min-h-[44px] rounded-full border border-white/20 px-4 text-sm font-semibold text-white/70 hover:text-white"
              >
                Clear
              </button>
            </div>
          )}
          {inviteError && (
            <p role="alert" className="text-sm text-red-300">
              {inviteError}
            </p>
          )}
          {inviteNote && (
            <p role="status" className="text-sm text-yellow-200">
              {inviteNote}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
