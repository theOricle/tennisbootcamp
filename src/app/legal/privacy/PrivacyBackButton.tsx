"use client";

import { TEXT_LINK_MUTED } from "@/components/ui/TextLink";

// A 44px target at white/70 with the shared focus ring (audit L4, L7, M23).
export function PrivacyBackButton() {
  return (
    <button type="button" onClick={() => window.history.back()} className={TEXT_LINK_MUTED}>
      ← Back
    </button>
  );
}
