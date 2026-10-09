// Arrow-key movement for a radio group with roving focus (audit M22): the
// booking slot picker. Pure, so src/scripts/test-forms-a11y.ts can pin it.

/**
 * The index the focus moves to from `from` by `step` (+1 next, -1 previous),
 * skipping disabled items and wrapping at either end. Returns `from` when no
 * other item is enabled, and -1 when nothing is enabled at all.
 */
export function nextEnabledIndex(disabled: readonly boolean[], from: number, step: 1 | -1): number {
  const n = disabled.length;
  if (n === 0 || disabled.every(Boolean)) return -1;
  let i = from;
  for (let tries = 0; tries < n; tries++) {
    i = (i + step + n) % n;
    if (!disabled[i]) return i;
  }
  return from;
}

/** The item that holds the group's one tab stop: the checked one, else the first enabled. */
export function tabStopIndex(disabled: readonly boolean[], checked: number): number {
  if (checked >= 0 && checked < disabled.length && !disabled[checked]) return checked;
  return disabled.findIndex((d) => !d);
}

/** The arrow keys a radio group answers, as a step; null for any other key. */
export function arrowStep(key: string): 1 | -1 | null {
  if (key === "ArrowRight" || key === "ArrowDown") return 1;
  if (key === "ArrowLeft" || key === "ArrowUp") return -1;
  return null;
}
