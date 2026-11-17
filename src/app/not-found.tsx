import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { MainAction } from "@/components/ui/MainAction";

// A server component, so the 404 carries its own title (audit M10) instead of
// the bare site name. Only the quiz side line's link runs on the client.
export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center bg-[#061427] px-6 text-white">
      <div className="w-full max-w-lg text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-[#B4E655]">404</p>
        <Heading as="h1" className="mt-3">
          We couldn&apos;t find that page.
        </Heading>
        <p className="mt-3 text-white/70">Maybe these links help —</p>

        {/* The main action is the lime button here too (audit M12; owner,
            2026-11-16), with the quiz as its side line; then two outlines. */}
        <MainAction source="not-found" className="mt-10 justify-center" />
        <nav aria-label="Helpful links" className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
          <Button variant="secondary" href="/programs">
            Programs
          </Button>
          <Button variant="secondary" href="/">
            Home
          </Button>
        </nav>
      </div>
    </main>
  );
}
