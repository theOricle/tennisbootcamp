/**
 * The one keyboard focus ring (audit L7, design-system.md "Focus states"):
 * lime at half strength, offset from the navy, shown for keyboard focus only.
 * Every interactive element that sets `focus:outline-none` carries it.
 */
export const FOCUS_RING =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]";
