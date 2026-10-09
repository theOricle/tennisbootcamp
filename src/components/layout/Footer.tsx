import Image from "next/image";
import Link from "next/link";
import { FOOTER_GROUPS, site } from "@/content/site";
import { Container } from "@/components/layout/Container";

const FOCUS =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]";

// Every footer row is a 44px target (audit M11, L4).
const ROW = `inline-flex min-h-[44px] items-center rounded text-sm text-white/70 transition-colors hover:text-white ${FOCUS}`;

/**
 * Site footer in columns (audit M11, L6): the logo and tagline, the site
 * links, the policies, and a mailto contact, inside one footer <nav>.
 */
export function Footer() {
  const socials = site.socials.filter((s) => s.href !== "#");

  return (
    <footer className="border-t border-white/10">
      <Container className="py-12 md:py-14">
        <div className="grid gap-10 md:grid-cols-[1.3fr_2fr_1.2fr] md:gap-8">
          <div>
            <Link href="/" className={`inline-flex rounded-lg ${FOCUS}`}>
              <Image
                src="/images/brand/logo.svg"
                alt="Tennis Bootcamp home"
                width={192}
                height={52}
                className="h-10 w-auto"
              />
            </Link>
            <p className="mt-4 text-sm text-white/60">{site.tagline}</p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-8">
            {FOOTER_GROUPS.map((group) => (
              <div key={group.heading}>
                <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">
                  {group.heading}
                </h2>
                <ul role="list" className="mt-2">
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
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">
              Contact
            </h2>
            <ul role="list" className="mt-2">
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

        <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-white/60 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} TENNISBOOTCAMP.CA. All Rights Reserved</p>
          {site.footerNote ? <p>{site.footerNote}</p> : null}
        </div>
      </Container>
    </footer>
  );
}
