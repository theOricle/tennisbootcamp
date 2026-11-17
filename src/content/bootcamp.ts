import { GROUP_MAX_PLAYERS } from "@/content/programs";

// The bootcamp words (owner, 2026-11-16 and 2026-11-17): every group is a
// group bootcamp, tennis and fitness built for tennis in every class. A
// class rotates between tennis drills and fitness drills all class and
// finishes with point play. The two parts are named Tennis and Fitness.
// Never a minute split, never a share of the class, and never another
// sport's name for the fitness part (ops/briefs/voice.md, "Bootcamp
// words"); `npm test` (test-joining-flow.ts) pins the words and the nevers.

/** What a part of the class trains: the word under each tile, and the tile's glyph. */
export type ClassTile = {
  label: string;
  icon: "technique" | "footwork" | "tactics" | "focus" | "power" | "speed" | "stamina" | "mobility";
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

/** The home section's heading. */
export const CLASS_HEADING = "Tennis and fitness in every class.";

/**
 * The heading's words as they sit inside a sentence: "tennis and fitness in
 * every class". Page descriptions and the quiz's reason lines read it, so the
 * idea is typed once.
 */
export const CLASS_IDEA = `${CLASS_HEADING.charAt(0).toLowerCase()}${CLASS_HEADING.slice(1, -1)}`;

/** The two parts of every class, in the order they are shown. */
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
      { label: "Speed", icon: "speed" },
      { label: "Stamina", icon: "stamina" },
      { label: "Mobility", icon: "mobility" },
    ],
  },
];

/** "technique, footwork, tactics and focus": what a part trains, as it sits in a sentence. */
export function trainsInWords(part: ClassPart): string {
  const words = part.trains.map((tile) => tile.label.toLowerCase());
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/**
 * How a class runs, and how many it takes: the three lines under the blocks.
 * The group size reads the one public number in src/content/programs.ts.
 */
export const CLASS_RUNS: readonly { text: string; icon: "rotate" | "play" | "players" }[] = [
  { text: "Rotate between the two all class", icon: "rotate" },
  { text: "Finish with point play", icon: "play" },
  { text: `Up to ${GROUP_MAX_PLAYERS} players a group`, icon: "players" },
];

/** The hero's tag: what we run, and where. */
export const HERO_TAG = "Group bootcamps · Toronto";
