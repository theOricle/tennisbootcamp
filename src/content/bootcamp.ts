import { TIER_COUNT_WORD } from "@/lib/tiers";

// The bootcamp words (owner, 2026-11-16 and 2026-11-17): every group is a
// group bootcamp, tennis and fitness built for tennis in every class. A
// class rotates between tennis drills and fitness drills all class and
// finishes with point play. The two parts are named Tennis and Fitness.
// Fitness is hard fitness work built for tennis, for power, stamina,
// stability and cardio, on top of the tennis training (owner, 2026-11-19).
// Never a minute split, never a share of the class, never a general class
// length or a number of classes a week, and never another sport's name for
// the fitness part (ops/briefs/voice.md, "Bootcamp words"); `npm test`
// (test-joining-flow.ts) pins the words and the nevers.

/** What a part of the class trains: the word under each tile, and the tile's glyph. */
export type ClassTile = {
  label: string;
  icon: "technique" | "footwork" | "tactics" | "focus" | "power" | "stamina" | "stability" | "cardio";
};

export type ClassPart = {
  /** "Tennis" or "Fitness": the part's one name. */
  name: string;
  /** The small tag beside the name, when the part has one. */
  tag?: string;
  /** The lime block (Tennis) or the court-navy block (Fitness). */
  tone: "lime" | "court";
  trains: readonly ClassTile[];
};

/**
 * The idea as a sentence of its own: the bootcamp programs' card lines open
 * with it. The home band said it word for word until 2026-11-19; it names
 * the two parts now, each with what it trains (BOOTCAMP_POINTS, below).
 */
export const CLASS_HEADING = "Tennis and fitness in every class.";

/**
 * The heading's words as they sit inside a sentence: "tennis and fitness in
 * every class". Page descriptions and the quiz's reason lines read it, so the
 * idea is typed once.
 */
export const CLASS_IDEA = `${CLASS_HEADING.charAt(0).toLowerCase()}${CLASS_HEADING.slice(1, -1)}`;

/**
 * The two parts of every class, in the order they are shown. Fitness trains
 * power, stamina, stability and cardio (owner, 2026-11-19; they replaced
 * power, speed, stamina and mobility).
 */
export const CLASS_PARTS: readonly ClassPart[] = [
  {
    name: "Tennis",
    tone: "lime",
    trains: [
      { label: "Technique", icon: "technique" },
      { label: "Footwork", icon: "footwork" },
      { label: "Tactics", icon: "tactics" },
      { label: "Focus", icon: "focus" },
    ],
  },
  {
    name: "Fitness",
    tag: "Built for tennis",
    tone: "court",
    trains: [
      { label: "Power", icon: "power" },
      { label: "Stamina", icon: "stamina" },
      { label: "Stability", icon: "stability" },
      { label: "Cardio", icon: "cardio" },
    ],
  },
];

/** "technique, footwork, tactics and focus": what a part trains, as it sits in a sentence. */
export function trainsInWords(part: ClassPart): string {
  const words = part.trains.map((tile) => tile.label.toLowerCase());
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/**
 * How a class runs: the two lines under the Tennis and Fitness blocks (the
 * About page). The group size is not one of them: About states it once, in
 * its list, and the program pages in theirs.
 */
export const CLASS_RUNS: readonly { text: string; icon: "rotate" | "play" }[] = [
  { text: "Rotate between the two all class", icon: "rotate" },
  { text: "Finish with point play", icon: "play" },
];

/** "Five": the tier count from src/lib/tiers.ts, in words, capitalised to open the third point. */
const LEVEL_COUNT = `${TIER_COUNT_WORD.charAt(0).toUpperCase()}${TIER_COUNT_WORD.slice(1)}`;

/**
 * What a bootcamp is, in three points (owner, 2026-11-17): the thin band
 * straight under the home page's hero. Each is a bold lead and the rest of
 * its phrase. The first two name the two parts of every class, each with
 * what it trains (owner, 2026-11-19): Tennis, by three of its four tiles,
 * with the racket; Fitness, by two of its four, with the bolt. Only Tennis's
 * is a list, so two lists never sit side by side. They replaced "Tennis and
 * fitness in every class" and "Point play to finish every class", which left
 * the band only: About ("Rotate between the two all class", "Finish with
 * point play") and the program pages (CLASS_LINE and their lists) still say
 * both. The third hints at the levels and moving up (owner, 2026-11-18): the
 * count reads the tier count, never typed, and "climb" is the ladder's own
 * word on /assessment ("The ladder you're climbing"); it promises no timing.
 * It replaced the same group for the whole cohort, which the program pages'
 * lists and About still say. No price, no group size, no class length and
 * no classes a week: `npm test` (test-joining-flow.ts) pins it.
 */
export const BOOTCAMP_POINTS: readonly { lead: string; rest: string; icon: "technique" | "power" | "stairs" }[] = [
  { lead: "Tennis", rest: "technique, tactics and focus", icon: "technique" },
  { lead: "Fitness", rest: "for power and stamina", icon: "power" },
  { lead: `${LEVEL_COUNT} levels`, rest: "to climb", icon: "stairs" },
];

/** The band's name for assistive tech; it has no visible heading. */
export const BOOTCAMP_POINTS_LABEL = "What a bootcamp is";

/** The hero's tag: what we run, and where. */
export const HERO_TAG = "Group bootcamps · Toronto";
