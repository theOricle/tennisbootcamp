import type { Cohort } from "@/types/cohort";
import type { TrainingLocation } from "@/types/location";

// Our locations (owner, 2026-10-12), the one editable list. It supersedes the
// 2026-09-08 "name no venue" rule (backlog #1) for this club. Every group in
// src/content/programs.ts names its location by id; a second location is a
// new entry here, then its groups. Nothing here imports the programs, so the
// catalog, the cards and the structured data can all read it.
//
// The owner gave a name and an area only: no street address, hours or court
// counts are published, and the map link searches the club's name.

/** A Google Maps search link (Maps URLs API): it searches by name, so no address is invented. */
export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export const locations: readonly TrainingLocation[] = [
  {
    id: "newtonbrook",
    name: "Newtonbrook Tennis Club",
    area: "North York, Toronto",
    locality: "North York",
    region: "ON",
    country: "CA",
    mapsUrl: mapsSearchUrl("Newtonbrook Tennis Club North York"),
  },
];

/** A location by id, or undefined. */
export function locationById(id: string | null | undefined): TrainingLocation | undefined {
  if (!id) return undefined;
  return locations.find((l) => l.id === id);
}

/**
 * The location a visitor starts on: the only one while there is one, so the
 * choice is made for them (preselected, never a dead end); none when there
 * are several, so they choose first.
 */
export function defaultLocation(): TrainingLocation | null {
  return locations.length === 1 ? locations[0] : null;
}

/** "Newtonbrook Tennis Club, North York, Toronto": a location on one line. */
export function locationLine(location: TrainingLocation): string {
  return `${location.name}, ${location.area}`;
}

/**
 * Where a cohort trains. A cohort carries the admin's free-text location
 * note (cohorts.location_label, "Court / meeting details"): when it names a
 * location, by id or by name, that location; otherwise the default location
 * while there is only one. Null when there are several and the note names
 * none, so nothing is guessed.
 */
export function locationForCohort(cohort: Pick<Cohort, "locationId">): TrainingLocation | null {
  const note = (cohort.locationId ?? "").trim().toLowerCase();
  if (note) {
    const named = locations.find(
      (l) => note === l.id || note.includes(l.id) || note.includes(l.name.toLowerCase())
    );
    if (named) return named;
  }
  return defaultLocation();
}
