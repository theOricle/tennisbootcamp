import type { Coach } from "@/types/coach";

/**
 * The coach card (home, About) and the JSON-LD Person read this list. The
 * first entry is the lead coach. Elsewhere the site speaks for "our coaches"
 * and "the coaching team" and never names a coach (owner, 2026-10-12).
 */
export const coaches: Coach[] = [
  {
    id: "coach-1",
    name: "Sina Kassaian",
    role: "Program Coordinator / High Performance Coach",
    bio: "High-performance coaching focused on technique, strategy, fitness, and mental toughness.",
    website: "",
  },
];
