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
// assistive tech, autocomplete off. `payload()` adds the honeypot's value and
// how many milliseconds the form has been on screen.

import { useCallback, useEffect, useRef, useState } from "react";
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

export function useBotCheck() {
  const renderedAt = useRef<number | null>(null);
  const [honeypot, setHoneypot] = useState("");

  useEffect(() => {
    renderedAt.current = Date.now();
  }, []);

  const payload = useCallback(
    () => ({
      [HONEYPOT_FIELD]: honeypot,
      [FILL_TIME_FIELD]:
        renderedAt.current == null ? null : Date.now() - renderedAt.current,
    }),
    [honeypot]
  );

  const field = (
    <div style={HIDDEN} aria-hidden="true">
      <label htmlFor={`bot-check-${HONEYPOT_FIELD}`}>Website</label>
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
