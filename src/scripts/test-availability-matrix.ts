// Run from project root: npx tsx src/scripts/test-availability-matrix.ts
// Exercises the pure level × availability aggregation behind the cohort
// form's matrix (src/lib/availabilityMatrix.ts). Exits non-zero on failure.

import { aggregateAvailabilityMatrix, type MatrixPlayer } from "../lib/availabilityMatrix";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}\n      expected ${e}\n      got      ${a}`);
  }
}

const pool: MatrixPlayer[] = [
  { id: "a", name: "Ava", level: 3.0, availability: { days: { mon: ["eve"], wed: ["eve"] }, v: 1 } },
  { id: "b", name: "Ben", level: 3.5, availability: { days: { mon: ["eve"], sat: ["mor"] }, v: 1 } },
  { id: "c", name: "Cleo", level: 4.0, availability: { days: { mon: ["eve"] }, v: 1 } },
  { id: "d", name: "Dev", level: 3.0, availability: null },                // in band, no grid
  { id: "e", name: "Eli", level: null, availability: { days: { mon: ["eve"] }, v: 1 } }, // unleveled
  { id: "f", name: "", level: 3.0, availability: '{"days":{"mon":["mor","eve"]},"v":1}' }, // JSON string, unnamed
];

// ─── Band filter ──────────────────────────────────────────────────────────────

console.log("band 3.0–3.5");
const m = aggregateAvailabilityMatrix(pool, 3.0, 3.5);
check("counts leveled players inside the band", m.inBand, 4); // Ava, Ben, Dev, (unnamed)
check("counts those with any grid", m.withAvailability, 3);
check("Mon evening = Ava, Ben, unnamed", m.cells.mon.eve, {
  count: 3,
  names: ["Ava", "Ben", "Unnamed player"],
});
check("Mon morning = unnamed only (JSON-string grid parsed)", m.cells.mon.mor, {
  count: 1,
  names: ["Unnamed player"],
});
check("Wed evening = Ava", m.cells.wed.eve.names, ["Ava"]);
check("Sat morning = Ben", m.cells.sat.mor.names, ["Ben"]);
check("out-of-band Cleo is excluded", m.cells.mon.eve.names.includes("Cleo"), false);
check("unleveled Eli never counts", m.cells.mon.eve.names.includes("Eli"), false);
check("empty cell is zero with no names", m.cells.sun.aft, { count: 0, names: [] });
check("not flagged unbanded", m.unbanded, false);

// ─── Open-ended and missing bands ─────────────────────────────────────────────

console.log("open-ended bands");
const upper = aggregateAvailabilityMatrix(pool, 3.5, null);
check("min only → 3.5 and up", upper.cells.mon.eve.names, ["Ben", "Cleo"]);
const lower = aggregateAvailabilityMatrix(pool, null, 3.0);
check("max only → up to 3.0", lower.cells.mon.eve.names, ["Ava", "Unnamed player"]);

console.log("no band");
const all = aggregateAvailabilityMatrix(pool, null, null);
check("flagged unbanded", all.unbanded, true);
check("every leveled player counts", all.inBand, 5);
check("Mon evening across all leveled", all.cells.mon.eve.count, 4);

// ─── Shape ────────────────────────────────────────────────────────────────────

console.log("shape");
check("7 day rows", Object.keys(m.cells).length, 7);
check("3 bands per day", Object.keys(m.cells.mon).length, 3);
check("empty pool is all zeros", aggregateAvailabilityMatrix([], 3, 3).inBand, 0);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
