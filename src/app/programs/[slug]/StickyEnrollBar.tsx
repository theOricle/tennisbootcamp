"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function StickyEnrollBar({
  cohortId,
  price,
  programTitle,
}: {
  cohortId: string;
  price: string;
  programTitle: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById("hero-cta");
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#061427]/95 px-4 pt-3 backdrop-blur-sm transition-transform duration-200 md:hidden ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
      style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-white/60">{programTitle}</p>
          <p className="text-sm font-semibold text-white">{price}</p>
        </div>
        <Link
          href={`/enroll/${cohortId}`}
          className="rounded-full bg-[#B4E655] px-5 py-2.5 text-sm font-semibold text-[#061427] transition hover:brightness-110"
        >
          Enroll now →
        </Link>
      </div>
    </div>
  );
}
