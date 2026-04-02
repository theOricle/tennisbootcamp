import type { PropsWithChildren } from "react";

export function Card({ children }: PropsWithChildren) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 shadow-md">
      {children}
    </div>
  );
}
