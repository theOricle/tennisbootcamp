"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/layout/Container";
import { FOCUS_RING as FOCUS } from "@/components/ui/focus";
import { NAV_LINKS, type NavLink } from "@/content/site";
import { GROUPS_ANCHOR, JOIN_CTA_HREF, JOIN_CTA_LABEL } from "@/lib/mainAction";
import { signOut, useAuthState } from "@/lib/useAuthState";

/** "page" on the link's own page, "true" inside its section (a program page under Programs). */
function currentState(pathname: string, href: string): "page" | "true" | undefined {
  if (pathname === href) return "page";
  if (pathname.startsWith(`${href}/`)) return "true";
  return undefined;
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      {open ? (
        <path d="M6 6l12 12M18 6L6 18" />
      ) : (
        <path d="M4 7h16M4 12h16M4 17h16" />
      )}
    </svg>
  );
}

const TEXT_ACTION = `min-h-[44px] items-center rounded-full px-3 text-sm font-semibold text-white/70 transition-colors hover:text-white ${FOCUS}`;
const DRAWER_ROW = `-mx-4 flex min-h-[48px] items-center rounded-xl px-4 text-base transition-colors hover:bg-white/5 hover:text-white ${FOCUS}`;

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

  // The top menu (owner, 2026-11-16): Programs and About, plus Admin for an admin.
  const links: NavLink[] = isAdmin ? [...NAV_LINKS, { href: "/admin", label: "Admin" }] : [...NAV_LINKS];
  // Inside the quiz the header carries no main button (audit L12): the
  // page's own Next button is the only primary.
  const inQuiz = pathname === "/intake" || pathname.startsWith("/intake/");
  // The main button, for everyone: to the groups. On /programs it scrolls to
  // the group list instead of reloading the page.
  const joinHref = pathname === JOIN_CTA_HREF ? `#${GROUPS_ANCHOR}` : JOIN_CTA_HREF;
  // Two links, "Sign in" and the button fit from md. A signed-in visitor has
  // more in the header (Sign out, Dashboard, Admin for an admin), so their
  // text links wait for lg, as they always did, and the menu button stays
  // until then. Complete class literals, so Tailwind keeps both.
  const wideFrom = signedIn ? 1024 : 768;
  const SHOW_WIDE = signedIn ? "lg:flex" : "md:flex";
  const HIDE_WIDE = signedIn ? "lg:hidden" : "md:hidden";

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
  // to the wide layout closes it (audit L5).
  useEffect(() => {
    if (!menuOpen) return;
    firstLinkRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeMenu(true);
    }
    function onPointerDown(e: PointerEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) closeMenu(false);
    }
    const wide = window.matchMedia(`(min-width: ${wideFrom}px)`);
    function onWide(e: MediaQueryListEvent) {
      if (e.matches) closeMenu(false);
    }

    // Lock the root only (QA 2026-10-10, high). Hiding overflow on <body> as
    // well made body the scroll container for the sticky header, which then
    // fell back to its place at the top of the document: after a scroll the
    // open menu sat off-screen and the page could not move.
    const html = document.documentElement;
    const previousOverflow = html.style.overflow;
    html.style.overflow = "hidden";

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    wide.addEventListener("change", onWide);
    return () => {
      html.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      wide.removeEventListener("change", onWide);
    };
  }, [menuOpen, closeMenu, wideFrom]);

  // The Supabase SDK loads only when someone signs out (audit M40).
  function handleSignOut() {
    void signOut();
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
      <Container className="flex items-center justify-between gap-4 py-2.5 md:py-3.5">
        <Link href="/" className={`flex shrink-0 items-center rounded-lg ${FOCUS}`}>
          <Image
            src="/images/brand/logo.svg"
            alt="Tennis Bootcamp"
            width={192}
            height={52}
            className="h-9 w-auto md:h-10"
            priority
          />
        </Link>

        {/* Text links, between the logo and the actions (audit M11). */}
        <nav aria-label="Main" className={`hidden items-center gap-1 ${SHOW_WIDE}`}>
          {links.map(({ href, label }) => {
            const current = currentState(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={current}
                className={`inline-flex min-h-[44px] items-center rounded-full px-3.5 text-sm font-medium transition-colors ${FOCUS} ${
                  current
                    ? "text-white underline decoration-[#B4E655] decoration-2 underline-offset-[10px]"
                    : "text-white/70 hover:text-white"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {signedIn ? (
            <button type="button" onClick={handleSignOut} className={`hidden lg:inline-flex ${TEXT_ACTION}`}>
              Sign out
            </button>
          ) : (
            <Link
              href="/login"
              aria-current={currentState(pathname, "/login")}
              className={`hidden md:inline-flex ${TEXT_ACTION}`}
            >
              Sign in
            </Link>
          )}

          {/* The actions: tablet and desktop. Phones get the menu and the
              bar at the bottom. A signed-in visitor keeps Dashboard, and
              everyone gets the main button, except inside the quiz. */}
          {signedIn && (
            <Button variant="secondary" size="compact" href="/dashboard" className="hidden md:inline-flex">
              Dashboard
            </Button>
          )}
          {!inQuiz && (
            <Button
              variant="primary"
              size="compact"
              href={joinHref}
              className="hidden whitespace-nowrap md:inline-flex"
            >
              {JOIN_CTA_LABEL}
            </Button>
          )}

          <button
            ref={toggleRef}
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((o) => !o)}
            className={`-mr-2.5 inline-flex h-11 w-11 items-center justify-center rounded-full text-white transition-colors hover:bg-white/5 ${HIDE_WIDE} ${FOCUS}`}
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
        className={`absolute inset-x-0 top-full ${HIDE_WIDE} ${menuOpen ? "visible" : "invisible"}`}
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
                    className={`${DRAWER_ROW} font-semibold ${current ? "text-white" : "text-white/80"}`}
                  >
                    {current ? (
                      <span className="mr-3 h-4 w-0.5 rounded-full bg-[#B4E655]" aria-hidden="true" />
                    ) : null}
                    {label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-3 flex flex-col gap-3 border-t border-white/10 pt-4">
              {signedIn ? (
                <div className="flex flex-col gap-1">
                  <Link
                    href="/dashboard"
                    onClick={() => setMenuOpen(false)}
                    className={`${DRAWER_ROW} font-semibold text-white/80`}
                  >
                    Dashboard
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      handleSignOut();
                    }}
                    className={`${DRAWER_ROW} text-left text-white/70`}
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className={`${DRAWER_ROW} font-semibold text-white/80`}
                >
                  Sign in
                </Link>
              )}
              {/* The main button closes the list, for everyone. */}
              {!inQuiz && (
                <Button variant="primary" href={joinHref} onClick={() => setMenuOpen(false)} className="w-full">
                  {JOIN_CTA_LABEL}
                </Button>
              )}
            </div>
          </Container>
        </div>
      </div>
    </header>
  );
}
