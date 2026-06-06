import { testimonials } from "@/content/testimonials";

export function Testimonials() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-14">
      <div className="grid gap-6 md:grid-cols-3">
        {testimonials.map((t) => (
          <div
            key={t.name}
            className="flex flex-col rounded-2xl border border-white/10 bg-[#071830] p-6"
          >
            <div className="mb-4">
              <p className="text-sm font-semibold text-[#B4E655]">{t.name}</p>
              <p className="text-xs text-white/50">{t.role}</p>
            </div>
            <p className="flex-1 text-sm leading-relaxed text-white/85">
              &ldquo;{t.quote}&rdquo;
            </p>
            {t.stat && (
              <div className="mt-4">
                <span className="rounded-full bg-[#B4E655]/10 px-3 py-1 text-xs font-semibold text-[#B4E655]">
                  {t.stat}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-white/35">
        Real reviews from real athletes — names changed during pre-launch.
      </p>
    </section>
  );
}
