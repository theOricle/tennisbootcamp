"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#061427]/95 shadow-[0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm"
          : ""
      }`}
    >
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
          <Button variant="primary" href="/intake" className="rounded-full px-5 py-2">
            Get Priority Placement
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
