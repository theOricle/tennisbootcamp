import type { Coach } from "@/types/coach";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";

type CoachesProps = {
  coaches: Coach[];
  /** Defaults to "Your coach" while there is one coach, "Meet the Coaches" after. */
  title?: string;
};

/** "Sina Kassaian" → "SK": first letter of the first and last name. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
}

// Until a consented photo exists, the coach gets a monogram in the tier-badge
// geometry (the same hexagon field and lime ring as src/components/tiers),
// not an empty grey circle (audit M16). Decorative: the name sits beside it.
function CoachMonogram({ name }: { name: string }) {
  return (
    <div className="relative h-14 w-14 shrink-0" aria-hidden="true">
      <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full">
        <polygon
          points="32,3 57,17.5 57,46.5 32,61 7,46.5 7,17.5"
          fill="#061427"
          stroke="#B4E655"
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        <polygon
          points="32,9 51.5,20.25 51.5,43.75 32,55 12.5,43.75 12.5,20.25"
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity={0.12}
          strokeWidth={1}
          strokeLinejoin="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-base font-semibold tracking-wide text-white">
        {initialsOf(name)}
      </span>
    </div>
  );
}

export function Coaches({ coaches, title }: CoachesProps) {
  const heading = title ?? (coaches.length > 1 ? "Meet the Coaches" : "Your coach");

  return (
    // No padding or width of its own: the page's Container sets both (audit H2).
    <section aria-labelledby="coaches-title">
      <Heading id="coaches-title">{heading}</Heading>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {coaches.map((c) => (
          <Card key={c.id}>
            <div className="flex gap-4 p-6">
              <CoachMonogram name={c.name} />
              <div>
                <div className="font-semibold text-white">{c.name}</div>
                <div className="text-sm text-white/60">{c.role}</div>
                <p className="mt-3 text-sm text-white/70">{c.bio}</p>

                {c.website ? (
                  <a
                    className="mt-3 inline-block text-sm text-[#B4E655] hover:underline"
                    href={c.website}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {c.website}
                  </a>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
