import type { PropsWithChildren } from "react";
import { Container, SECTION_RHYTHM_CLASS } from "./Container";

/**
 * A page's stacked content sections inside the one Container, with the one
 * vertical rhythm (audit H2). The sections inside set no padding or width.
 */
export function PageStack({ children }: PropsWithChildren) {
  return (
    <Container className={`${SECTION_RHYTHM_CLASS} space-y-16 md:space-y-20`}>
      {children}
    </Container>
  );
}
