import Link from "next/link";
import type { ComponentProps } from "react";
import { FOCUS_RING } from "@/components/ui/focus";

/**
 * A standalone text link — "← Back", "Forgot password?", "Request a time
 * instead" — as a 44px target (audit L4, WCAG 2.5.8) with the shared focus
 * ring (L7). Links inside running text stay inline and need neither.
 */
export const TEXT_LINK_CLASS = `inline-flex min-h-[44px] items-center rounded ${FOCUS_RING}`;

/** The muted standalone link: white/70, white on hover. */
export const TEXT_LINK_MUTED = `${TEXT_LINK_CLASS} text-sm text-white/70 transition-colors hover:text-white`;

/** The lime standalone link. */
export const TEXT_LINK_LIME = `${TEXT_LINK_CLASS} text-sm font-semibold text-[#B4E655] underline-offset-2 hover:underline`;

type TextLinkProps = ComponentProps<typeof Link> & { tone?: "muted" | "lime" };

export function TextLink({ tone = "muted", className = "", ...props }: TextLinkProps) {
  const base = tone === "lime" ? TEXT_LINK_LIME : TEXT_LINK_MUTED;
  return <Link className={`${base} ${className}`.trim()} {...props} />;
}
