import type { Coach } from "@/types/coach";
import { Card } from "@/components/ui/Card";

type CoachesProps = {
  coaches: Coach[];
  title?: string;
};

export function Coaches({ coaches, title = "Meet the Coaches" }: CoachesProps) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-12">
      <h2 className="text-2xl font-semibold text-white">{title}</h2>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {coaches.map((c) => (
          <Card key={c.id}>
            <div className="flex gap-4 p-6">
              <div className="h-14 w-14 shrink-0 rounded-full bg-white/10" aria-hidden />
              <div>
                <div className="font-semibold text-white">{c.name}</div>
                <div className="text-sm text-white/60">{c.role}</div>
                <p className="mt-3 text-sm text-white/70">{c.bio}</p>

                {c.website ? (
                  <a
                    className="mt-3 inline-block text-sm text-[#B4E655] hover:underline"
                    href={c.website}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {c.website}
                  </a>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
