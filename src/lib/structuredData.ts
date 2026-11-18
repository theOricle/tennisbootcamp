// JSON-LD builders (backlog #7). Every value comes from existing content or
// constants: no street address, no ratings or reviews, no invented data.
// Absolute URLs come from SITE_URL so the switch to tennisbootcamp.ca is an
// env change only. The club we train at is named since 2026-10-12 (owner): a
// Place with its locality, province and country only, never a street
// address, hours or a map link the owner has not given.

import type { Program } from "@/types/program";
import type { TrainingLocation } from "@/types/location";
import { site } from "@/content/site";
import { coaches } from "@/content/coaches";
import { locations } from "@/content/locations";
import { COHORT_TOTAL } from "@/content/programs";
import { locationsForProgram } from "@/lib/locationCatalog";
import { SITE_URL } from "@/lib/siteUrl";

export type JsonLdObject = { [key: string]: unknown };

/** The one Organization node; Course pages point at it by this @id. */
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;

const LOGO_PATH = "/images/brand/logo.svg";
const AREA_SERVED = "Toronto";

// The lead coach (the first in src/content/coaches.ts): the founder, and the
// instructor on every Course. His title rides along as jobTitle, the same
// words as the coach card (owner, 2026-10-12).
const leadCoach = coaches[0];

function coachPerson(): JsonLdObject {
  return { "@type": "Person", name: leadCoach.name, jobTitle: leadCoach.role };
}

/**
 * A location as a schema.org Place: the club's name and a PostalAddress with
 * the locality, province and country only (no streetAddress: none is
 * published).
 */
export function placeJsonLd(location: TrainingLocation): JsonLdObject {
  return {
    "@type": "Place",
    name: location.name,
    address: {
      "@type": "PostalAddress",
      addressLocality: location.locality,
      addressRegion: location.region,
      addressCountry: location.country,
    },
  };
}

export function organizationJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: site.name,
    url: SITE_URL,
    email: site.email,
    logo: `${SITE_URL}${LOGO_PATH}`,
    // The city, then each club we train at (owner, 2026-10-12).
    areaServed: [{ "@type": "City", name: AREA_SERVED }, ...locations.map(placeJsonLd)],
    ...(leadCoach ? { founder: coachPerson() } : {}),
  };
}

/**
 * Course for one /programs/[slug] page, or null when the program has no
 * stated price (coming soon, or no weekend timetable): Course markup needs
 * an Offer, and we don't invent one.
 *
 * The Offer is the whole price of one cohort, CAD (owner, 2026-11-17: the
 * whole price only, never a per-session figure). The CourseInstance is held
 * at the club its groups train at (a Place, no street address). It carries
 * no schedule: no repeat frequency, no class length and no workload, since
 * the site makes no general claim about how long a class is or how many
 * there are a week (owner, 2026-11-17). A program at several clubs gets one
 * CourseInstance per club.
 */
export function courseJsonLd(program: Program): JsonLdObject | null {
  if (program.comingSoon || !program.timetable?.length) return null;
  const url = `${SITE_URL}/programs/${program.slug}`;

  const instance: JsonLdObject = {
    "@type": "CourseInstance",
    courseMode: "onsite",
    ...(program.schedule ? { description: program.schedule } : {}),
    ...(leadCoach ? { instructor: coachPerson() } : {}),
  };
  const places = locationsForProgram(program.slug);
  const instances = places.length > 0 ? places.map((l) => ({ ...instance, location: placeJsonLd(l) })) : [instance];

  return {
    "@context": "https://schema.org",
    "@type": "Course",
    "@id": `${url}#course`,
    name: program.title,
    description: program.description,
    url,
    // Inlined, not only referenced (audit M10): a program page carries no
    // Organization node of its own, so the @id alone left the provider nameless.
    provider: {
      "@type": "Organization",
      "@id": ORGANIZATION_ID,
      name: site.name,
      url: SITE_URL,
    },
    offers: {
      "@type": "Offer",
      category: "Paid",
      price: COHORT_TOTAL,
      priceCurrency: "CAD",
      ...(program.priceLine ? { description: program.priceLine } : {}),
      url,
    },
    hasCourseInstance: instances.length === 1 ? instances[0] : instances,
  };
}

/** Serialises for an inline script: "<" is escaped so content can't close the tag. */
export function serializeJsonLd(data: JsonLdObject): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
