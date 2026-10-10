import { programs } from "@/content/programs";
import type { SessionSlot } from "@/types/cohort";
import { artFocusForCohort } from "@/lib/plates/variant";
import { ProgramPlate } from "@/components/plates/ProgramPlate";

// "Player preview" (design specs §4.8): the strip plate a player will see on
// their dashboard for this cohort, drawn from the admin's form state (or the
// saved cohort) — the program's composition, profiled by the level band, the
// court side picked by the cohort id, the Adult class lit by the first slot.
// Decorative: the caption says what it is, the art carries no data.

export function PlayerPreview({
  programId,
  levelMin,
  levelMax,
  sessions,
  seed,
  className = "",
}: {
  programId: string;
  levelMin: number | string | null;
  levelMax: number | string | null;
  sessions: SessionSlot[];
  /** The cohort id once saved; a draft previews on a fixed seed. */
  seed?: string | null;
  className?: string;
}) {
  const program = programs.find((p) => p.id === programId);
  if (!program) return null;
  return (
    <figure className={className}>
      <div className="aspect-[3/1] w-full overflow-hidden rounded-xl border border-white/10 bg-[#061427]">
        <ProgramPlate
          plate={program.plate}
          frame="strip"
          density="compact"
          comingSoon={program.comingSoon}
          levelMin={levelMin === "" ? null : levelMin}
          levelMax={levelMax === "" ? null : levelMax}
          seed={seed || "preview"}
          focusSlot={artFocusForCohort(program, { sessions })}
        />
      </div>
      <figcaption className="mt-1.5 text-xs text-white/60">
        Player preview: the art on each player&apos;s dashboard for this cohort.
      </figcaption>
    </figure>
  );
}
