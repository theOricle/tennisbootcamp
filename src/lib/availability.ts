// Weekly availability template — shared parse/serialize helpers.
//
// Stored shape (profiles.availability, assessment_bookings.availability):
//   {"days":{"mon":["eve"],"wed":["mor","eve"],"sat":["aft"]},"v":1}
// Day keys mon…sun; bands mor (before 12), aft (12–17), eve (after 17).
// Bands, not hours: phone-friendly to fill, coarse enough to cluster on later.
// `v` allows a future hour-grid upgrade.

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const BANDS = ["mor", "aft", "eve"] as const;

export type Day = (typeof DAYS)[number];
export type Band = (typeof BANDS)[number];

export type Availability = {
  days: Partial<Record<Day, Band[]>>;
  v: 1;
};

export const DAY_LABELS: Record<Day, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

export const BAND_LABELS: Record<Band, string> = {
  mor: "Morning",
  aft: "Afternoon",
  eve: "Evening",
};

function isDay(x: string): x is Day {
  return (DAYS as readonly string[]).includes(x);
}
function isBand(x: string): x is Band {
  return (BANDS as readonly string[]).includes(x);
}

/** Build a normalized Availability object from a loose day→bands map. */
export function serializeAvailability(
  days: Partial<Record<Day, Band[]>>
): Availability {
  const clean: Partial<Record<Day, Band[]>> = {};
  for (const day of DAYS) {
    const bands = days[day];
    if (!bands || bands.length === 0) continue;
    const ordered = BANDS.filter((b) => bands.includes(b));
    if (ordered.length > 0) clean[day] = ordered;
  }
  return { days: clean, v: 1 };
}

/** Parse anything (a stored object, a JSON string, null) into a safe Availability. */
export function parseAvailability(input: unknown): Availability {
  let raw: unknown = input;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return { days: {}, v: 1 };
    }
  }
  if (!raw || typeof raw !== "object") return { days: {}, v: 1 };
  const daysIn = (raw as { days?: unknown }).days;
  if (!daysIn || typeof daysIn !== "object") return { days: {}, v: 1 };

  const days: Partial<Record<Day, Band[]>> = {};
  for (const [key, value] of Object.entries(daysIn as Record<string, unknown>)) {
    if (!isDay(key) || !Array.isArray(value)) continue;
    const bands = value.filter(
      (b): b is Band => typeof b === "string" && isBand(b)
    );
    if (bands.length > 0) days[key] = BANDS.filter((b) => bands.includes(b));
  }
  return { days, v: 1 };
}

/** Compact human-readable chips, e.g. ["Mon eve", "Wed mor/eve"]. */
export function availabilityChips(input: unknown): string[] {
  const { days } = parseAvailability(input);
  return DAYS.filter((d) => days[d]?.length).map(
    (d) => `${DAY_LABELS[d]} ${(days[d] as Band[]).join("/")}`
  );
}
