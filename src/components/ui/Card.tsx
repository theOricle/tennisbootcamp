import type { PropsWithChildren } from "react";

/**
 * The standard card surface (audit L1, design specs §2.3): rounded-2xl, a
 * hairline border, a faint fill and no shadow. Shadows on dark cards are a
 * design-system anti-pattern.
 */
export const CARD_CLASS = "rounded-2xl border border-white/10 bg-white/[0.03]";

export function Card({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return <div className={`${CARD_CLASS} ${className}`.trim()}>{children}</div>;
}
