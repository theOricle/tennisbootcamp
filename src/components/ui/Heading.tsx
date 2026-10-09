import type { ReactNode } from "react";

type Level = "h1" | "h2" | "h3";
type Size = "page" | "section" | "card";

/**
 * One type scale for headings (audit L1, design-system.md). The tag sets the
 * document outline; the size sets the look, so a card title can be an h3
 * without borrowing a page title's size. All semibold with tight tracking;
 * the home hero H1 is the one exception and keeps its own display size.
 */
export const HEADING_CLASS: Record<Size, string> = {
  page: "text-3xl font-semibold tracking-tight text-white md:text-4xl",
  section: "text-2xl font-semibold tracking-tight text-white md:text-3xl",
  card: "text-lg font-semibold tracking-tight text-white",
};

const DEFAULT_SIZE: Record<Level, Size> = { h1: "page", h2: "section", h3: "card" };

export function Heading({
  as: Tag = "h2",
  size,
  id,
  className = "",
  children,
}: {
  as?: Level;
  size?: Size;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag id={id} className={`${HEADING_CLASS[size ?? DEFAULT_SIZE[Tag]]} ${className}`.trim()}>
      {children}
    </Tag>
  );
}
