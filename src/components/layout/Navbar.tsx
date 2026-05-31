"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/browser";

const MOBILE_NAV_LINKS = [
  { href: "/programs", label: "Programs" },
  { href: "/about", label: "About" },
  { href: "/events", label: "Events" },
  { href: "/locations", label: "Locations" },
  { href: "/video-lessons", label: "Video Lessons" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setIsSignedIn(!!data.session);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Close drawer on outside tap
  useEffect(() => {
    if (!menuOpen) return;
    function onOutsideClick(e: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [menuOpen]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <header
      ref={headerRef}
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#061427]/95 shadow-[0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm"
          : ""
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/images/brand/logo.svg"
            alt="Tennis Bootcamp"
            width={192}
            height={52}
            className="h-10 w-auto"
            priority
          />
        </Link>

        {/* Desktop nav — hidden on mobile */}
        <div className="hidden items-center gap-3 md:flex">
          {isSignedIn ? (
            <>
              <Button
                variant="secondary"
                href="/dashboard"
                className="rounded-full px-5 py-2"
              >
                Dashboard
              </Button>
              <button
                onClick={() => void handleSignOut()}
                className="rounded-full px-5 py-2 text-sm font-semibold text-white/70 hover:text-white"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                href="/programs"
                className="rounded-full px-5 py-2"
              >
                Our Programs
              </Button>
              <Button
                variant="primary"
                href="/intake"
                className="rounded-full px-5 py-2"
              >
                Find My Program
              </Button>
            </>
          )}
        </div>

        {/* Mobile hamburger — hidden on desktop */}
        <button
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 md:hidden"
        >
          {menuOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="border-t border-white/10 bg-[#061427] px-6 pb-6 pt-2 md:hidden">
          <nav className="flex flex-col">
            {MOBILE_NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="rounded-xl px-4 py-3 text-sm font-semibold text-white/80 transition-colors hover:bg-white/5 hover:text-white"
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 border-t border-white/10 pt-4">
            {isSignedIn ? (
              <div className="flex flex-col gap-1">
                <Link
                  href="/dashboard"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-xl px-4 py-3 text-sm font-semibold text-white/80 transition-colors hover:bg-white/5 hover:text-white"
                >
                  Dashboard
                </Link>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    void handleSignOut();
                  }}
                  className="rounded-xl px-4 py-3 text-left text-sm text-white/60 hover:bg-white/5 hover:text-white"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Button
                variant="primary"
                href="/intake"
                onClick={() => setMenuOpen(false)}
                className="w-full justify-center rounded-full py-3 text-sm"
              >
                Find My Program
              </Button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
