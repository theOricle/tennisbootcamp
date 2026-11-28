"use client";

import { useId, useState } from "react";
import type { Availability, AvailabilitySource } from "@/lib/availability";
import { ClockIcon } from "@/components/ui/icons";
import { TEXT_LINK_CLASS } from "@/components/ui/TextLink";
import { AvailabilityEditor } from "./AvailabilityEditor";

// One player's times on the dashboard (backlog #105): the week as one line,
// and "Edit times" ("Add times" with nothing on file), which opens the same
// grid the page showed open for every player before. Closed by default, so
// two players are two lines, not two 21-cell grids.

export function PlayerTimes({
  participantId,
  participantName,
  showName,
  line,
  availability,
  note,
  updatedAt,
  source,
  defaultOpen = false,
}: {
  participantId: string;
  participantName: string;
  showName: boolean;
  /** "Wed evening · Sat morning and afternoon" (timesLine); empty with nothing on file. */
  line: string;
  availability: Availability;
  note: string;
  updatedAt: string | null;
  source: AvailabilitySource | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const action = line ? "Edit times" : "Add times";
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5">
        <p className="flex min-w-0 items-start gap-2 py-1 text-sm text-white/75">
          <ClockIcon className="mt-[3px] h-[15px] w-[15px] shrink-0 opacity-65" />
          <span>{line || "No times on file yet."}</span>
        </p>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className={`${TEXT_LINK_CLASS} shrink-0 text-sm font-semibold text-[#B4E655] underline-offset-2 hover:underline`}
        >
          {open ? "Close" : action}
          {showName && participantName && <span className="sr-only"> for {participantName}</span>}
        </button>
      </div>
      {open && (
        <div id={panelId} className="mt-3 max-w-xl pb-2">
          <AvailabilityEditor
            participantId={participantId}
            participantName={participantName}
            showName={showName}
            initialAvailability={availability}
            initialNote={note}
            updatedAt={updatedAt}
            source={source}
          />
        </div>
      )}
    </div>
  );
}
