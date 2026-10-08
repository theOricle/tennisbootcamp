import { serializeJsonLd, type JsonLdObject } from "@/lib/structuredData";

/** One application/ld+json script (backlog #7). Renders nothing visible. */
export function JsonLd({ data }: { data: JsonLdObject }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
