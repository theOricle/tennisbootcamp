// Age bands — how old the player is, asked once per person (backlog #14).
//
// The intake used to ask this for a whole submission ("Who is training?"), so a
// parent registering a 9-year-old and a 15-year-old could only answer once.
// The band now lives on the participant, next to their name.
//
// The bands are the ones the programs themselves are written for:
//   junior  7–13   Kids' Summer Camp
//   teen    14–17  Bootcamps (Ages 14+)
//   adult   18+    Bootcamps and Group Lessons (Adults 18+)
//
// Pure and server-safe: `src/lib/household.ts` reads it, so nothing here may
// depend on React or on a "use client" module.

export const AGE_BANDS = ["adult", "teen", "junior"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const AGE_BAND_LABELS: Record<AgeBand, string> = {
  adult: "Adult (18+)",
  teen: "Teen (14–17)",
  junior: "Junior (7–13)",
};

export function isAgeBand(x: unknown): x is AgeBand {
  return typeof x === "string" && (AGE_BANDS as readonly string[]).includes(x);
}

/** Under 18 follows from the band — a teen and a junior are both minors. */
export function ageBandIsMinor(band: AgeBand): boolean {
  return band !== "adult";
}

/**
 * The two-value audience the recommender and Sheet column 5 still speak.
 * Teens and juniors are both "youth"; the band itself carries the 14+ split.
 */
export function ageBandToWho(band: AgeBand): "adult" | "youth" {
  return band === "adult" ? "adult" : "youth";
}
