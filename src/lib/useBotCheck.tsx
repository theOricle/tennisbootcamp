"use client";

// Client half of the bot check (backlog #25, see src/lib/botCheck.ts).
//
//   const bot = useBotCheck();
//   ...
//   body: JSON.stringify({ ...fields, ...bot.payload() })
//   ...
//   <form>{bot.field}...</form>
//
// `field` is the honeypot: off-screen, out of the tab order, hidden from
// assistive tech, autocomplete off, with a name no autofill heuristic
// recognises. `payload()` adds the honeypot's value and the fill time —
// performance.now() at submit, i.e. milliseconds since navigation start. It
// is not measured from mount on purpose: on a slow phone a person can start
// typing before React hydrates, and a page restored from bfcache keeps its
// clock running. A client-side route change (next/link) keeps the same
// origin too, so a prefilled page (the quiz → booking handoff) only ever
// reads larger, never smaller.

import { useCallback, useState } from "react";
import { FILL_TIME_FIELD, HONEYPOT_FIELD } from "@/lib/botCheck";

const HIDDEN: React.CSSProperties = {
  position: "absolute",
  left: "-10000px",
  top: "auto",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  opacity: 0,
  pointerEvents: "none",
};

function fillTime(): number | null {
  if (typeof performance === "undefined" || typeof performance.now !== "function") {
    return null;
  }
  return Math.round(performance.now());
}

export function useBotCheck() {
  const [honeypot, setHoneypot] = useState("");

  const payload = useCallback(
    () => ({
      [HONEYPOT_FIELD]: honeypot,
      [FILL_TIME_FIELD]: fillTime(),
    }),
    [honeypot]
  );

  const field = (
    <div style={HIDDEN} aria-hidden="true">
      <label htmlFor={`bot-check-${HONEYPOT_FIELD}`}>Leave this empty</label>
      <input
        id={`bot-check-${HONEYPOT_FIELD}`}
        name={HONEYPOT_FIELD}
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
      />
    </div>
  );

  return { payload, field };
}
