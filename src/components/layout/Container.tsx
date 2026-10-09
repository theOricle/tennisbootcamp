import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

/**
 * The one horizontal rule for the site (audit H2): every page edge, the header
 * and the footer share `mx-auto max-w-6xl px-6`, so the logo, a breadcrumb and
 * the content start on the same left edge.
 *
 * Pages apply it. Section components (ProgramsGrid, Coaches, EventsList,
 * EmailCapture and the rest) never set horizontal padding or a max-width of
 * their own. Full-bleed bands (the hero, the trust bar, a page's header band)
 * paint their background edge to edge and put a Container inside.
 *
 * A narrower reading measure is set on the text block (`max-w-2xl`), never on
 * the container, so the left edge never moves.
 */
export const CONTAINER_CLASS = "mx-auto w-full max-w-6xl px-6";

/** The one vertical rhythm for a page's content block. */
export const SECTION_RHYTHM_CLASS = "py-12 md:py-16";

type ContainerProps<T extends ElementType> = {
  as?: T;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

export function Container<T extends ElementType = "div">({
  as,
  className = "",
  children,
  ...rest
}: ContainerProps<T>) {
  const Tag: ElementType = as ?? "div";
  return (
    <Tag className={`${CONTAINER_CLASS} ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}
