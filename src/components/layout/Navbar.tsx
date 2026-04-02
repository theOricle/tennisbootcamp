import Link from "next/link";
import { Button } from "@/components/ui/Button";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-3">
          <img src="/images/brand/logo.svg" alt="Tennis Bootcamp" className="h-10 w-auto" />
        </Link>

        <div className="flex items-center gap-3">
          <Button variant="secondary" href="/programs" className="rounded-full px-5 py-2">
            Our Programs
          </Button>
          <Button variant="secondary" href="/login" className="rounded-full px-5 py-2">
            Login/Register
          </Button>

          <button
            aria-label="Menu"
            className="ml-2 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
          >
            ☰
          </button>
        </div>
      </div>
    </header>
  );
}
