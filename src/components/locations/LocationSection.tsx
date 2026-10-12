import Link from "next/link";
import { locations } from "@/content/locations";
import { locationSummary } from "@/lib/locationCatalog";
import { Heading } from "@/components/ui/Heading";
import { TEXT_LINK_LIME, TEXT_LINK_MUTED } from "@/components/ui/TextLink";
import { MapLink, PinIcon } from "./LocationLine";

// The home page's location section (owner, 2026-10-12): compact, under the
// programs. The club's name and area, the map link, and one honest line from
// the lineup ("All our training is here right now: …"). No street address,
// hours or court counts: the owner has not given them. Sets no horizontal
// padding or max-width; the page's Container does (audit H2).

export function LocationSection() {
  const single = locations.length === 1;
  return (
    <section aria-labelledby="our-location-title">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <Heading id="our-location-title">{single ? "Our location" : "Our locations"}</Heading>
        <Link href="/locations" className={`${TEXT_LINK_MUTED} font-semibold`}>
          {single ? "Location details →" : "All locations →"}
        </Link>
      </div>

      <ul role="list" className="grid gap-4">
        {locations.map((location) => (
          <li
            key={location.id}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:flex md:items-center md:justify-between md:gap-10 md:p-8"
          >
            <div className="flex min-w-0 items-start gap-4">
              <span
                aria-hidden="true"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#B4E655]/25 bg-[#B4E655]/10 text-[#B4E655]"
              >
                <PinIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold tracking-tight text-white">{location.name}</h3>
                <p className="mt-0.5 text-sm text-white/70">{location.area}</p>
                <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-white/75">
                  {locationSummary(location)}
                </p>
              </div>
            </div>
            <p className="mt-4 shrink-0 pl-[3.75rem] md:mt-0 md:pl-0">
              <MapLink location={location} className={`${TEXT_LINK_LIME} whitespace-nowrap`} />
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
