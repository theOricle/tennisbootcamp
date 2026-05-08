import type { Location } from "@/types/location";
import { Card } from "@/components/ui/Card";

type LocationsGridProps = {
  locations: Location[];
  title?: string;
};

export function LocationsGrid({ locations, title = "Our Locations" }: LocationsGridProps) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-12">
      <h2 className="text-2xl font-semibold text-white">{title}</h2>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {locations.map((l) => (
          <Card key={l.id}>
            <div className="p-6">
              <div className="text-lg font-semibold text-white">{l.name}</div>
              <div className="mt-2 text-sm text-white/70">{l.address}</div>

              <div className="mt-4 flex flex-wrap gap-3 text-sm text-white/70">
                {l.phone ? <span>{l.phone}</span> : null}
                {l.website ? (
                  <a
                    className="text-[#B4E655] hover:underline"
                    href={l.website.startsWith("http") ? l.website : `https://${l.website}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {l.website.replace(/^https?:\/\//, "")}
                  </a>
                ) : null}
              </div>
              <a
                className="mt-4 inline-block text-sm text-white/50 hover:text-white/80"
                href={`https://maps.google.com/?q=${encodeURIComponent(l.address)}`}
                target="_blank"
                rel="noreferrer"
              >
                Get directions →
              </a>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
