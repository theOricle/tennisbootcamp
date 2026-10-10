// Level × availability matrix for the cohort form (pure, no DB).
//
// Given the leveled pool and a cohort's numeric level band, count how many
// in-band players are free in each day × band cell and keep their names so
// the coach can tap a cell and see who. No clustering, no suggestions — the
// coach reads the grid and decides.

import {
  DAYS,
  BANDS,
  parseAvailability,
  type Day,
  type Band,
} from "@/lib/availability";
import { levelWithinRange } from "@/lib/tiers";

export type MatrixPlayer = {
  id: string;
  name: string | null;
  level: number | null;
  availability: unknown;
};

export type MatrixCell = {
  count: number;
  names: string[];
};

/** A player in a cell, with the participant id an invite is sent for (audit M28). */
export type MatrixPerson = { id: string; name: string };

export type AvailabilityMatrix = {
  /** cells[day][band] */
  cells: Record<Day, Record<Band, MatrixCell>>;
  /** who[day][band]: the same players as `cells`, by participant id, in name order. */
  who: Record<Day, Record<Band, MatrixPerson[]>>;
  /** Players inside the band (leveled only). */
  inBand: number;
  /** Of those, players with at least one cell selected. */
  withAvailability: number;
  /** True when no band was given and every leveled player is counted. */
  unbanded: boolean;
};

function emptyWho(): Record<Day, Record<Band, MatrixPerson[]>> {
  const who = {} as Record<Day, Record<Band, MatrixPerson[]>>;
  for (const d of DAYS) {
    who[d] = {} as Record<Band, MatrixPerson[]>;
    for (const b of BANDS) who[d][b] = [];
  }
  return who;
}

function emptyCells(): Record<Day, Record<Band, MatrixCell>> {
  const cells = {} as Record<Day, Record<Band, MatrixCell>>;
  for (const d of DAYS) {
    cells[d] = {} as Record<Band, MatrixCell>;
    for (const b of BANDS) cells[d][b] = { count: 0, names: [] };
  }
  return cells;
}

/**
 * Aggregate the pool into the matrix. Unleveled players never count: the
 * coach-assigned level is the placement source of truth. With no band at all
 * (both bounds null) every leveled player is counted, flagged `unbanded` so
 * the UI can say so.
 */
export function aggregateAvailabilityMatrix(
  players: MatrixPlayer[],
  levelMin: number | null,
  levelMax: number | null
): AvailabilityMatrix {
  const cells = emptyCells();
  const who = emptyWho();
  const unbanded = levelMin === null && levelMax === null;
  let inBand = 0;
  let withAvailability = 0;

  for (const p of players) {
    if (p.level === null) continue;
    const inside = unbanded ? true : levelWithinRange(p.level, levelMin, levelMax);
    if (!inside) continue;
    inBand++;

    const { days } = parseAvailability(p.availability);
    let any = false;
    const label = (p.name ?? "").trim() || "Unnamed player";
    for (const d of DAYS) {
      for (const b of days[d] ?? []) {
        any = true;
        const cell = cells[d][b];
        cell.count++;
        cell.names.push(label);
        who[d][b].push({ id: p.id, name: label });
      }
    }
    if (any) withAvailability++;
  }

  for (const d of DAYS) {
    for (const b of BANDS) {
      cells[d][b].names.sort((a, z) => a.localeCompare(z));
      who[d][b].sort((a, z) => a.name.localeCompare(z.name));
    }
  }

  return { cells, who, inBand, withAvailability, unbanded };
}
