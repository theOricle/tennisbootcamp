import Image from "next/image";
import Link from "next/link";
import { FOOTER_GROUPS, NEWSLETTER_ANCHOR, site } from "@/content/site";
import { Container } from "@/components/layout/Container";
import { EmailCapture } from "@/components/sections/EmailCapture";

const FOCUS =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]";

// Every footer row is a 44px target (audit M11, L4).
const ROW = `inline-flex min-h-[44px] items-center rounded text-sm text-white/70 transition-colors hover:text-white ${FOCUS}`;

const COLUMN_HEADING = "text-xs font-semibold uppercase tracking-[0.12em] text-white/60";

/**
 * Site footer (audit M11, L6; owner-approved design, 2026-11-17). On top,
 * the one newsletter line every page shares, with an id a "Notify me" button
 * can point at. Then the columns: the logo and tagline, the site links
 * (Locations and Assessment live here now), the policies, and a mailto
 * contact, inside one footer <nav>. Then the copyright and the credit line.
 *
 * Never two newsletter forms on one page: a page that renders its own
 * (EmailCapture's band, marked `data-page-newsletter`) hides the line here.
 */
export function Footer() {
  const socials = site.socials.filter((s) => s.href !== "#");

  return (
    <footer className="border-t border-white/10">
      <Container>
        <div
          id={NEWSLETTER_ANCHOR}
          className="scroll-mt-24 border-b border-white/10 py-6 md:py-7 [body:has([data-page-newsletter])_&]:hidden"
        >
          <EmailCapture variant="line" source="footer_email_capture" />
        </div>

        <div className="grid gap-6 py-7 md:grid-cols-[1.3fr_2fr_1.2fr] md:gap-8 md:py-10">
          <div>
            <Link href="/" className={`inline-flex rounded-lg ${FOCUS}`}>
              <Image
                src="/images/brand/logo.svg"
                alt="Tennis Bootcamp home"
                width={192}
                height={52}
                className="h-9 w-auto"
              />
            </Link>
            <p className="mt-3 text-sm text-white/60">{site.tagline}</p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-6">
            {FOOTER_GROUPS.map((group) => (
              <div key={group.heading}>
                <h2 className={COLUMN_HEADING}>{group.heading}</h2>
                <ul role="list" className="mt-1">
                  {group.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className={ROW}>
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <div>
            <h2 className={COLUMN_HEADING}>Contact</h2>
            <ul role="list" className="mt-1">
              <li>
                <a href={`mailto:${site.email}`} className={ROW}>
                  {site.email}
                </a>
              </li>
              {socials.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${site.name} on ${s.label} (opens in new tab)`}
                    className={ROW}
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-white/10 pb-6 pt-5 text-xs text-white/60 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} TENNISBOOTCAMP.CA. All Rights Reserved</p>
          {site.footerNote ? <p>{site.footerNote}</p> : null}
        </div>
      </Container>
    </footer>
  );
}
