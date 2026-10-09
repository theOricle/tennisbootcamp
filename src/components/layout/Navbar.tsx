"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/browser";
import { trackQuizCtaClick } from "@/lib/analytics";
import { NAV_LINKS, type NavLink } from "@/content/site";
import { QUIZ_CTA_LABEL } from "@/lib/quizBar";
import { useAuthState } from "@/lib/useAuthState";

const FOCUS =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]";

/** "page" on the link's own page, "true" inside its section (a program page under Programs). */
function currentState(pathname: string, href: string): "page" | "true" | undefined {
  if (pathname === href) return "page";
  if (pathname.startsWith(`${href}/`)) return "true";
  return undefined;
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      {open ? (
        <path d="M6 6l12 12M18 6L6 18" />
      ) : (
        <path d="M4 7h16M4 12h16M4 17h16" />
      )}
    </svg>
  );
}

export function Navbar() {
  const pathname = usePathname() ?? "/";
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { signedIn, isAdmin } = useAuthState({ withRole: true });
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  // A route change closes the drawer (adjusting state during render, not in an effect).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  const links: NavLink[] = isAdmin ? [...NAV_LINKS, { href: "/admin", label: "Admin" }] : [...NAV_LINKS];

  const closeMenu = useCallback((returnFocus: boolean) => {
    setMenuOpen(false);
    if (returnFocus) toggleRef.current?.focus();
  }, []);

  // The header is solid navy from the top (audit L5); a hairline appears once the page scrolls.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Drawer open: focus moves in, Escape closes and returns focus, a tap
  // outside the header closes, the page behind stops scrolling, and growing
  // to the desktop layout closes it (audit L5).
  useEffect(() => {
    if (!menuOpen) return;
    firstLinkRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeMenu(true);
    }
    function onPointerDown(e: PointerEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) closeMenu(false);
    }
    const desktop = window.matchMedia("(min-width: 1024px)");
    function onDesktop(e: MediaQueryListEvent) {
      if (e.matches) closeMenu(false);
    }

    const html = document.documentElement;
    const previousOverflow = [html.style.overflow, document.body.style.overflow];
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    desktop.addEventListener("change", onDesktop);
    return () => {
      html.style.overflow = previousOverflow[0];
      document.body.style.overflow = previousOverflow[1];
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      desktop.removeEventListener("change", onDesktop);
    };
  }, [menuOpen, closeMenu]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <header
      ref={headerRef}
      // Keyboard focus leaving the header closes the drawer. A null
      // relatedTarget (a tap on iOS, which does not focus links) is ignored,
      // so a tapped drawer link is never hidden before its click lands.
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (menuOpen && next && !e.currentTarget.contains(next)) setMenuOpen(false);
      }}
      className={`sticky top-0 z-50 border-b bg-[#061427] transition-colors duration-300 ${
        scrolled || menuOpen ? "border-white/10" : "border-transparent"
      }`}
    >
      <Container className="flex items-center justify-between gap-4 py-3">
        <Link href="/" className={`flex shrink-0 items-center rounded-lg ${FOCUS}`}>
          <Image
            src="/images/brand/logo.svg"
            alt="Tennis Bootcamp"
            width={192}
            height={52}
            className="h-10 w-auto"
            priority
          />
        </Link>

        <div className="flex items-center gap-2">
          {/* Text links: desktop only (audit M11). */}
          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            {links.map(({ href, label }) => {
              const current = currentState(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={current}
                  className={`inline-flex min-h-[44px] items-center rounded-full px-3 text-sm font-semibold transition-colors ${FOCUS} ${
                    current
                      ? "text-white underline decoration-[#B4E655] decoration-2 underline-offset-[10px]"
                      : "text-white/70 hover:text-white"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
            <span className="mx-2 h-5 w-px bg-white/15" aria-hidden="true" />
            {signedIn ? (
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className={`inline-flex min-h-[44px] items-center rounded-full px-3 text-sm font-semibold text-white/70 transition-colors hover:text-white ${FOCUS}`}
              >
                Sign out
              </button>
            ) : (
              <Link
                href="/login"
                aria-current={currentState(pathname, "/login")}
                className={`inline-flex min-h-[44px] items-center rounded-full px-3 text-sm font-semibold text-white/70 transition-colors hover:text-white ${FOCUS}`}
              >
                Sign in
              </Link>
            )}
          </nav>

          {/* The one action slot: tablet and desktop. Phones get the drawer and the sticky quiz bar. */}
          {signedIn ? (
            <Button variant="secondary" size="compact" href="/dashboard" className="hidden md:inline-flex">
              Dashboard
            </Button>
          ) : (
            <Button
              variant="primary"
              size="compact"
              href="/intake"
              onClick={() => trackQuizCtaClick("navbar")}
              className="hidden whitespace-nowrap md:inline-flex"
            >
              {QUIZ_CTA_LABEL}
            </Button>
          )}

          <button
            ref={toggleRef}
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((o) => !o)}
            className={`inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 text-white/85 transition-colors hover:border-white/30 hover:text-white lg:hidden ${FOCUS}`}
          >
            <MenuIcon open={menuOpen} />
          </button>
        </div>
      </Container>

      {/* Mobile drawer: always mounted so aria-controls resolves; inert and
          invisible while closed (audit L5). */}
      <div
        id="mobile-menu"
        inert={!menuOpen}
        className={`absolute inset-x-0 top-full lg:hidden ${menuOpen ? "visible" : "invisible"}`}
      >
        <div
          aria-hidden="true"
          onClick={() => closeMenu(true)}
          className={`absolute inset-x-0 top-0 h-[100dvh] bg-[#061427]/75 motion-safe:transition-opacity motion-safe:duration-200 ${
            menuOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          className={`relative border-b border-white/10 bg-[#061427] motion-safe:transition motion-safe:duration-200 ${
            menuOpen ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
          }`}
        >
          <Container className="pb-6 pt-2">
            <nav aria-label="Mobile" className="flex flex-col">
              {links.map(({ href, label }, i) => {
                const current = currentState(pathname, href);
                return (
                  <Link
                    key={href}
                    ref={i === 0 ? firstLinkRef : undefined}
                    href={href}
                    aria-current={current}
                    onClick={() => setMenuOpen(false)}
                    className={`-mx-4 flex min-h-[48px] items-center rounded-xl px-4 text-base font-semibold transition-colors hover:bg-white/5 ${FOCUS} ${
                      current ? "text-white" : "text-white/80 hover:text-white"
                    }`}
                  >
                    {current ? (
                      <span className="mr-3 h-4 w-0.5 rounded-full bg-[#B4E655]" aria-hidden="true" />
                    ) : null}
                    {label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-3 border-t border-white/10 pt-4">
              {signedIn ? (
                <div className="flex flex-col gap-1">
                  <Link
                    href="/dashboard"
                    onClick={() => setMenuOpen(false)}
                    className={`-mx-4 flex min-h-[48px] items-center rounded-xl px-4 text-base font-semibold text-white/80 transition-colors hover:bg-white/5 hover:text-white ${FOCUS}`}
                  >
                    Dashboard
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      void handleSignOut();
                    }}
                    className={`-mx-4 flex min-h-[48px] items-center rounded-xl px-4 text-left text-base text-white/70 transition-colors hover:bg-white/5 hover:text-white ${FOCUS}`}
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <Link
                    href="/login"
                    onClick={() => setMenuOpen(false)}
                    className={`-mx-4 flex min-h-[48px] items-center rounded-xl px-4 text-base font-semibold text-white/80 transition-colors hover:bg-white/5 hover:text-white ${FOCUS}`}
                  >
                    Sign in
                  </Link>
                  <Button
                    variant="primary"
                    href="/intake"
                    onClick={() => {
                      setMenuOpen(false);
                      trackQuizCtaClick("navbar");
                    }}
                    className="w-full"
                  >
                    {QUIZ_CTA_LABEL}
                  </Button>
                </div>
              )}
            </div>
          </Container>
        </div>
      </div>
    </header>
  );
}
