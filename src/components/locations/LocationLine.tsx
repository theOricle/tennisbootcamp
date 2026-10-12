import type { TrainingLocation } from "@/types/location";
import { FOCUS_RING } from "@/components/ui/focus";
import { TEXT_LINK_LIME } from "@/components/ui/TextLink";

// The location pieces every surface shares (owner, 2026-10-12): the pin, the
// map link and the one-line "where". Plain markup with no state, so server
// pages, the enroll wizard and the dashboard all render the same thing.

/** The map pin, decoration beside a location's name. */
export function PinIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21.5s-7-7.2-7-12.3a7 7 0 1 1 14 0c0 5.1-7 12.3-7 12.3z"
      />
      <circle cx="12" cy="9.2" r="2.5" />
    </svg>
  );
}

/** The inline lime link style, for a map link inside running text. */
export const MAP_LINK_INLINE = `rounded font-semibold text-[#B4E655] underline-offset-2 hover:underline ${FOCUS_RING}`;

/**
 * "Open in Google Maps ↗": a Google Maps search for the club, in a new tab.
 * The accessible name says which club and that a tab opens.
 */
export function MapLink({ location, className = MAP_LINK_INLINE }: { location: TrainingLocation; className?: string }) {
  return (
    <a href={location.mapsUrl} target="_blank" rel="noopener noreferrer" className={className}>
      Open in Google Maps
      <span className="sr-only"> ({location.name}, opens in a new tab)</span>
      <span aria-hidden="true" className="ml-1">
        ↗
      </span>
    </a>
  );
}

/**
 * The location stacked, for a narrow column (the dashboard side card, the
 * enroll summary): the name, the area under it, then the map link as a
 * standalone 44px link (audit L4).
 */
export function LocationBlock({
  location,
  mapLink = true,
  className = "",
}: {
  location: TrainingLocation;
  mapLink?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-start gap-2.5 ${className}`.trim()}>
      <PinIcon className="mt-[3px] h-4 w-4 shrink-0 text-[#B4E655]" />
      <div className="min-w-0 text-sm leading-relaxed">
        <p className="font-semibold text-white">{location.name}</p>
        <p className="text-white/70">{location.area}</p>
        {mapLink && (
          <p>
            <MapLink location={location} className={TEXT_LINK_LIME} />
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The location on one line: pin, name, area, and the map link where a page
 * shows one ("Newtonbrook Tennis Club · North York, Toronto · Open in Google
 * Maps ↗"). The facts wrap whole; the dots between them show from lg, where
 * the line fits, so a phone's second line never starts with one.
 */
export function LocationLine({
  location,
  mapLink = false,
  className = "",
}: {
  location: TrainingLocation;
  mapLink?: boolean;
  className?: string;
}) {
  const dot = (
    <span aria-hidden="true" className="mr-2 hidden text-white/60 lg:inline">
      ·
    </span>
  );
  return (
    <div className={`flex items-start gap-2 text-sm leading-relaxed ${className}`.trim()}>
      <PinIcon className="mt-[3px] h-4 w-4 shrink-0 text-[#B4E655]" />
      <p className="flex min-w-0 flex-wrap items-baseline gap-x-3 lg:gap-x-2">
        <span className="font-semibold text-white">{location.name}</span>
        <span className="text-white/70">
          {dot}
          {location.area}
        </span>
        {mapLink && (
          <span>
            {dot}
            <MapLink location={location} />
          </span>
        )}
      </p>
    </div>
  );
}
