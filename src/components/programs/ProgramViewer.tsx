"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { TierLine } from "@/components/tiers";
import { cohortAdmitsLevel, formatTierLevel, formatTierSpan, levelNumber } from "@/lib/tiers";

// The signed-in state of a program page (audit M32). The page itself is
// static (ISR, audit M39), so who is looking is read in the browser from
// /api/participants, the same session-gated list the forms use. A guest —
// and everyone while the read is in flight — sees the page as it is. A
// signed-in holder is already on Sina's list: instead of "Take the 2-minute
// quiz" (which would write a second quiz row), they see where their players'
// tiers sit against this program's span and the one thing worth doing —
// keeping their availability current.

type ViewerPlayer = {
  id: string;
  name: string | null;
  relationship: string;
  level: number | null;
};

type Viewer = { state: "loading" | "guest" } | { state: "member"; players: ViewerPlayer[] };

let viewerRequest: Promise<Viewer> | null = null;

/** One read per page, shared by every island on it. */
function loadViewer(): Promise<Viewer> {
  viewerRequest ??= fetch("/api/participants", { credentials: "same-origin" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d): Viewer => {
      if (!d?.signedIn) return { state: "guest" };
      const players = Array.isArray(d.participants) ? (d.participants as ViewerPlayer[]) : [];
      return { state: "member", players };
    })
    .catch((): Viewer => ({ state: "guest" }));
  return viewerRequest;
}

function useViewer(): Viewer {
  const [viewer, setViewer] = useState<Viewer>({ state: "loading" });
  useEffect(() => {
    let live = true;
    loadViewer().then((v) => {
      if (live) setViewer(v);
    });
    return () => {
      live = false;
    };
  }, []);
  return viewer;
}

/** `guest` for visitors (and while loading), `member` for a signed-in holder. */
export function ViewerSwap({ guest, member }: { guest: ReactNode; member: ReactNode }) {
  const viewer = useViewer();
  return <>{viewer.state === "member" ? member : guest}</>;
}

function firstName(full: string | null): string {
  return (full ?? "").trim().split(/\s+/)[0] || "";
}

/**
 * The timetable card's call to action for a signed-in holder: each ranked
 * player's tier against the program's span ("Maya: Deuce · 3.0, inside this
 * program's levels"), the span rail with the first ranked player's marker,
 * and "Update my availability". Guests get `children` — the quiz and the
 * optional assessment, unchanged.
 */
export function ProgramViewerPanel({
  span,
  children,
}: {
  /** The program's level span (owner D2), or null when unset. */
  span: { min: number; max: number } | null;
  children: ReactNode;
}) {
  const viewer = useViewer();
  if (viewer.state !== "member") return <>{children}</>;

  const ranked = viewer.players.filter((p) => levelNumber(p.level) !== null);
  const several = viewer.players.length > 1;
  const first = ranked[0];
  const firstLevel = levelNumber(first?.level);
  const label = (p: ViewerPlayer) => (p.relationship === "self" ? "You" : firstName(p.name) || "Your player");

  return (
    <div className="mt-4 border-t border-[#B4E655]/20 pt-4">
      <p className="text-sm font-semibold text-white">
        {several
          ? "Your players are on Sina's list — keep their availability current."
          : "You're on Sina's list — keep your availability current."}
      </p>
      <p className="mt-1 text-sm text-white/70">
        Sina places every player by level and schedule. There is nothing else you need to do.
      </p>
      {span && ranked.length > 0 && (
        <>
          <ul className="mt-3 space-y-1 text-sm text-white/85">
            {ranked.map((p) => {
              const inside = cohortAdmitsLevel(p.level, span.min, span.max);
              return (
                <li key={p.id}>
                  <span className="font-semibold text-white">{label(p)}</span>: {formatTierLevel(p.level)},{" "}
                  {inside
                    ? "inside this program's levels"
                    : `outside this program's levels (${formatTierSpan(span.min, span.max)})`}
                  .
                </li>
              );
            })}
          </ul>
          <TierLine
            variant="rail"
            size="sm"
            span={span}
            marker={firstLevel !== null && first ? { level: firstLevel, label: label(first) } : null}
            labels="ends"
            className="mt-3"
          />
        </>
      )}
      <Button variant="primary" href="/dashboard#availability" className="mt-4 w-full">
        {several ? "Update availability" : "Update my availability"}
      </Button>
      <Button variant="secondary" href="/dashboard" className="mt-3 w-full">
        Open your dashboard
      </Button>
    </div>
  );
}
