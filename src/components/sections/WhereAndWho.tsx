import Link from "next/link";
import { coaches } from "@/content/coaches";
import { locations } from "@/content/locations";
import { MapLink, PinIcon } from "@/components/locations/LocationLine";
import { PersonIcon } from "@/components/ui/icons";
import { TEXT_LINK_LIME } from "@/components/ui/TextLink";

// Where and who (owner-approved design, 2026-11-17): the home page's two
// plain columns on hairlines, no boxes. "Where we train": the club's name
// and area from src/content/locations.ts and the map link (a Google Maps
// search; no street address is published). "Coaching": the lead coach's
// name and title from src/content/coaches.ts, the one place the home page
// names a coach (voice.md, staff wording), and the way to About, where the
// rest is said. Sets no gutter or page width: the page's Container does.

const LABEL = "flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/60";
const LABEL_GLYPH = "h-4 w-4 shrink-0 text-[#B4E655]";
const NAME = "mt-2 text-xl font-semibold tracking-tight text-white";
const DETAIL = "text-sm text-white/70";

export function WhereAndWho() {
  const lead = coaches[0];
  return (
    <div className="grid border-y border-white/10 md:grid-cols-2">
      <section aria-labelledby="where-we-train" className="pb-3 pt-[22px] md:pb-5 md:pt-[30px]">
        <h2 id="where-we-train" className={LABEL}>
          <PinIcon className={LABEL_GLYPH} />
          Where we train
        </h2>
        {locations.map((location) => (
          <div key={location.id}>
            <p className={NAME}>{location.name}</p>
            <p className={DETAIL}>{location.area}</p>
            <p>
              <MapLink location={location} className={TEXT_LINK_LIME} />
            </p>
          </div>
        ))}
      </section>

      {lead && (
        <section
          aria-labelledby="coaching"
          className="border-t border-white/10 pb-3 pt-[22px] md:border-l md:border-t-0 md:pb-5 md:pl-10 md:pt-[30px]"
        >
          <h2 id="coaching" className={LABEL}>
            <PersonIcon className={LABEL_GLYPH} />
            Coaching
          </h2>
          <p className={NAME}>{lead.name}</p>
          <p className={DETAIL}>{lead.role}</p>
          <p>
            <Link href="/about" className={TEXT_LINK_LIME}>
              About us
              <span aria-hidden="true" className="ml-1">
                →
              </span>
            </Link>
          </p>
        </section>
      )}
    </div>
  );
}
