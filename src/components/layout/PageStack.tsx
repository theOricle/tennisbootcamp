import type { PropsWithChildren } from "react";

export function PageStack({ children }: PropsWithChildren) {
  return (
    <div className="mx-auto max-w-6xl px-6 space-y-16">
      {children}
    </div>
  );
}
