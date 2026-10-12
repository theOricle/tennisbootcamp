// Club-membership copy, gated behind NEXT_PUBLIC_CLUB_GUEST_OK.
//
// The club is a government-owned non-profit community club. Whether a 20-minute
// assessment can run under the club's guest provisions is pending Sina's answer,
// so until the flag is set we ship the neutral line only.
//
//   unset / ""   → neutral line (default — ships now)
//   "true"       → Variant A (guests allowed for assessments)
//   "false"      → Variant B (members only, even for assessments)
//
// The venue is named since 2026-10-12 (owner: Newtonbrook Tennis Club, North
// York; src/content/locations.ts), so this file no longer stands in for it:
// every place that shows where we train reads the locations list. What stays
// here is the club-membership line only, neutral until the owner decides
// whether every player must hold the club's membership (D19). The strings are
// locked (ops/briefs/voice.md).

const NEUTRAL =
  "Court details and any club requirements are confirmed in your booking email.";

const VARIANT_A =
  "No membership needed for your assessment. When you join a program, the club asks for a season membership — $100 until November, paid directly to the club — which also gives you court access all season.";

const VARIANT_B =
  "The club hosting us asks that every player on court holds a season membership — $100 until November, paid directly to the club. It covers your assessment, your program, and open court access all season.";

export function membershipNote(): string {
  const flag = process.env.NEXT_PUBLIC_CLUB_GUEST_OK;
  if (flag === undefined || flag === "") return NEUTRAL;
  return flag === "true" ? VARIANT_A : VARIANT_B;
}
