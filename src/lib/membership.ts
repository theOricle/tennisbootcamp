// Club-membership copy, gated behind NEXT_PUBLIC_CLUB_GUEST_OK.
//
// The venue is a government-owned non-profit community club. Whether a 20-minute
// assessment can run under the club's guest provisions is pending Sina's answer,
// so until the flag is set we ship the neutral line only.
//
//   unset / ""   → neutral line (default — ships now)
//   "true"       → Variant A (guests allowed for assessments)
//   "false"      → Variant B (members only, even for assessments)

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
