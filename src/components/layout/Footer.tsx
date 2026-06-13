import Link from "next/link";
import { site } from "@/content/site";

export function Footer() {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto max-w-6xl px-6 py-10 text-sm text-white/70">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-semibold text-white">{site.name}</div>
            <div className="text-white/60">{site.email}</div>
            <Link
              href="/login"
              className="mt-2 inline-block rounded text-white/60 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
            >
              Log in
            </Link>
          </div>

          <div className="text-white/60">
            © {new Date().getFullYear()} TENNISBOOTCAMP.CA. All Rights Reserved
          </div>
        </div>

        {site.socials.filter((s) => s.href !== "#").length > 0 && (
          <div className="mt-4 flex gap-4">
            {site.socials
              .filter((s) => s.href !== "#")
              .map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${site.name} on ${s.label} (opens in new tab)`}
                  className="text-xs text-white/70 hover:text-white/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427] rounded"
                >
                  {s.label}
                </a>
              ))}
          </div>
        )}

        {site.footerNote ? (
          <div className="mt-4 text-xs text-white/40">{site.footerNote}</div>
        ) : null}
      </div>
    </footer>
  );
}
