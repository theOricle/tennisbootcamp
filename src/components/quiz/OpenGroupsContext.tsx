"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { GroupCard } from "@/lib/groupBlocks";

// The open blocks, handed from the quiz's server layout (src/app/intake/
// layout.tsx) to the quiz, a client page, so its already-taken screen can
// list them without a fetch of its own. Plain data: the cards' groups and
// block facts, nothing private (public blocks only, the fields a group card
// shows).

const OpenGroupsContext = createContext<readonly GroupCard[]>([]);

export function OpenGroupsProvider({ cards, children }: { cards: readonly GroupCard[]; children: ReactNode }) {
  return <OpenGroupsContext.Provider value={cards}>{children}</OpenGroupsContext.Provider>;
}

/** The open blocks' cards, or none outside the provider. */
export function useOpenGroups(): readonly GroupCard[] {
  return useContext(OpenGroupsContext);
}
