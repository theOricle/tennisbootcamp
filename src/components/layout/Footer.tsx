import { site } from "@/content/site";

export function Footer() {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto max-w-6xl px-6 py-10 text-sm text-white/70">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-semibold text-white">{site.name}</div>
            <div className="text-white/60">{site.email}</div>
          </div>

          <div className="text-white/50">
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
                  className="text-xs text-white/50 hover:text-white/80 transition-colors"
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
