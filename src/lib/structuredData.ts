// JSON-LD builders (backlog #7). Every value comes from existing content or
// constants: no street address, no ratings or reviews, no invented data.
// Absolute URLs come from SITE_URL so the switch to tennisbootcamp.ca is an
// env change only.

import type { Program } from "@/types/program";
import { site } from "@/content/site";
import { coaches } from "@/content/coaches";
import { COHORT_WEEKS, SESSION_PRICE } from "@/content/programs";
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

/**
 * Course for one /programs/[slug] page. Programs with a weekend timetable
 * carry an Offer (price per session, CAD, for a COHORT_WEEKS-session cohort);
 * coming-soon programs have no stated session price, so they carry none.
 */
export function courseJsonLd(program: Program): JsonLdObject {
  const url = `${SITE_URL}/programs/${program.slug}`;
  const priced = !program.comingSoon && Boolean(program.timetable?.length);

  const instance: JsonLdObject = {
    "@type": "CourseInstance",
    courseMode: "onsite",
    ...(program.schedule ? { courseWorkload: program.schedule } : {}),
    ...(priced
      ? {
          courseSchedule: {
            "@type": "Schedule",
            repeatFrequency: "P1W",
            repeatCount: COHORT_WEEKS,
          },
        }
      : {}),
  };

  return {
    "@context": "https://schema.org",
    "@type": "Course",
    "@id": `${url}#course`,
    name: program.title,
    description: program.description,
    url,
    provider: { "@id": ORGANIZATION_ID },
    ...(priced
      ? {
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
        }
      : {}),
    hasCourseInstance: instance,
  };
}

/** Serialises for an inline script: "<" is escaped so content can't close the tag. */
export function serializeJsonLd(data: JsonLdObject): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
