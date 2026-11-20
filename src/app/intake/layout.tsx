import type { Metadata } from "next";
import { programGroups } from "@/content/programs";
import { getPublicCohorts } from "@/lib/cohortsDb";
import { groupCards, openBlockCards } from "@/lib/groupBlocks";
import { readBlockSeats } from "@/lib/groupSeats";
import { OpenGroupsProvider } from "@/components/quiz/OpenGroupsContext";

export const metadata: Metadata = {
  title: "The 2-minute quiz",
  description:
    "A few questions about your game and your schedule. Our coaches place you in a group from your answers. The 20-minute on-court assessment is optional: it's $20, and it comes off the price when you enroll in a program.",
  openGraph: {
    title: "The 2-minute quiz | Tennis Bootcamp",
    description:
      "A few questions about your game and your schedule, then our coaches place you in a group. The 20-minute assessment is optional.",
  },
  robots: { index: false, follow: false },
  alternates: { canonical: "/intake" },
};

// The open blocks, read on the server and rebuilt at most once a minute, as
// /programs is (audit M39). The quiz is a client page; its already-taken
// screen lists these as group cards, each with "Join" (owner, 2026-11-19).
// Public blocks only, with the fields a group card shows. The screen lists
// the ones whose ages take one of the household's players and never a
// by-approval one (accountOpenCards); it reads all of them to know whether
// any is open at all.
export const revalidate = 60;

export default async function IntakeLayout({ children }: { children: React.ReactNode }) {
  const publicCohorts = await getPublicCohorts();
  const seats = await readBlockSeats(publicCohorts);
  const cards = openBlockCards(groupCards(programGroups, publicCohorts, seats));
  return <OpenGroupsProvider cards={cards}>{children}</OpenGroupsProvider>;
}
