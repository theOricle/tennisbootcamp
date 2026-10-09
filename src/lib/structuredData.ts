// JSON-LD builders (backlog #7). Every value comes from existing content or
// constants: no street address, no ratings or reviews, no invented data.
// Absolute URLs come from SITE_URL so the switch to tennisbootcamp.ca is an
// env change only.

import type { Program } from "@/types/program";
import { site } from "@/content/site";
import { coaches } from "@/content/coaches";
import { COHORT_WEEKS, SESSION_MINUTES, SESSION_PRICE } from "@/content/programs";
import { SITE_URL } from "@/lib/siteUrl";

export type JsonLdObject = { [key: string]: unknown };

/** The one Organization node; Course pages point at it by this @id. */
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;

const LOGO_PATH = "/images/brand/logo.svg";
const AREA_SERVED = "Toronto";

const headCoach = coaches.find((c) => c.role === "Head Coach") ?? coaches[0];

export function organizationJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: site.name,
    url: SITE_URL,
    email: site.email,
    logo: `${SITE_URL}${LOGO_PATH}`,
    areaServed: { "@type": "City", name: AREA_SERVED },
    ...(headCoach ? { founder: { "@type": "Person", name: headCoach.name } } : {}),
  };
}

/** Minutes as an ISO 8601 duration: 60 is "PT1H", 360 is "PT6H", 90 is "PT90M". */
export function isoDuration(minutes: number): string {
  return minutes % 60 === 0 ? `PT${minutes / 60}H` : `PT${minutes}M`;
}

/**
 * Course for one /programs/[slug] page, or null when the program has no
 * stated session price (coming soon, or no weekend timetable): Course markup
 * needs an Offer, and we don't invent one.
 *
 * The Offer is the price per session, CAD, for a COHORT_WEEKS-session cohort.
 * The CourseInstance runs weekly, COHORT_WEEKS times, SESSION_MINUTES each.
 * No location: there is no public venue address.
 */
export function courseJsonLd(program: Program): JsonLdObject | null {
  if (program.comingSoon || !program.timetable?.length) return null;
  const url = `${SITE_URL}/programs/${program.slug}`;

  const instance: JsonLdObject = {
    "@type": "CourseInstance",
    courseMode: "onsite",
    ...(program.schedule ? { description: program.schedule } : {}),
    courseWorkload: isoDuration(SESSION_MINUTES * COHORT_WEEKS),
    courseSchedule: {
      "@type": "Schedule",
      duration: isoDuration(SESSION_MINUTES),
      repeatFrequency: "Weekly",
      repeatCount: COHORT_WEEKS,
    },
    ...(headCoach ? { instructor: { "@type": "Person", name: headCoach.name } } : {}),
  };

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
      price: SESSION_PRICE,
      priceCurrency: "CAD",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: SESSION_PRICE,
        priceCurrency: "CAD",
        referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitText: "session" },
      },
      eligibleQuantity: { "@type": "QuantitativeValue", value: COHORT_WEEKS, unitText: "sessions" },
      ...(program.priceLine ? { description: program.priceLine } : {}),
      url,
    },
    hasCourseInstance: instance,
  };
}

/** Serialises for an inline script: "<" is escaped so content can't close the tag. */
export function serializeJsonLd(data: JsonLdObject): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
