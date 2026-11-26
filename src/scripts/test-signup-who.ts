// Run from project root: npx tsx src/scripts/test-signup-who.ts
//
// Pins backlog #97, the sign-up page's first step signed out: the visitor taps
// who the player is, then types the name. A youth group offers "My child" and
// "Someone else" and starts on "My child" ("Myself" stays only for an
// invitation for the holder themselves); any other group offers all four and
// starts on "Myself". No block asks an age or a level: the date of birth on
// step 2 is the one age question, and a typed player's under-18 flag is that
// date's alone, never a hidden band. The quiz and the booking keep their
// blocks exactly as they were.
//
// The repo has no DOM test runner: the chooser is rendered to static markup,
// and the wizard's wiring is read from its source. Exits non-zero on any
// failure.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EMPTY_HOUSEHOLD,
  RELATIONSHIP_LABELS,
  WhoIsThisFor,
  emptyGuest,
  householdIssues,
  signupStart,
  signupValue,
  type GuestParticipant,
  type Household,
  type HouseholdValue,
  type Relationship,
  type SignupWho,
} from "../components/participants/WhoIsThisFor";
import { ageBandBlock, computeAge, dobIsMinor, isYouthGroup } from "../lib/enrollPlayers";
import { whoStepIssues } from "../app/enroll/[cohortId]/EnrollWizard";
import { groupById } from "../content/programs";
import type { ProgramGroup } from "../types/program";

let failed = 0;
/** A check that throws (a helper missing, say) fails like any other. */
function check(name: string, run: () => boolean) {
  let ok = false;
  let detail = "";
  try {
    ok = run();
  } catch (err) {
    detail = err instanceof Error ? err.message : String(err);
  }
  console.log(`  ${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
}

/** Built on first use, so a throw fails the checks that need it, one by one. */
function lazy<T>(make: () => T): () => T {
  let made: { value: T } | null = null;
  return () => (made ??= { value: make() }).value;
}

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");

// ── Rendering the chooser ────────────────────────────────────────────────────

const signedOut: Household = {
  loading: false,
  signedIn: false,
  accountEmail: "",
  participants: [],
  reload: () => undefined,
};

type ChooserProps = Parameters<typeof WhoIsThisFor>[0];
const render = (props: Partial<ChooserProps> & { value: HouseholdValue }) =>
  renderToStaticMarkup(
    createElement(WhoIsThisFor, { household: signedOut, onChange: () => undefined, ...props })
  );

/** The words a piece of markup shows, in order. */
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

type Radio = { name: string; value: string; checked: boolean; tag: string };
/** Every radio input, in order, with its group name and whether it is checked. */
function radiosIn(html: string): Radio[] {
  return [...html.matchAll(/<input\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => /\stype="radio"/.test(tag))
    .map((tag) => ({
      name: /\sname="([^"]*)"/.exec(tag)?.[1] ?? "",
      value: /\svalue="([^"]*)"/.exec(tag)?.[1] ?? "",
      checked: /\schecked(=""|[\s/>])/.test(tag),
      tag,
    }));
}
/** One block's radios: the block whose key is given. */
const blockRadios = (radios: Radio[], key: string) => radios.filter((r) => r.name === `guest-${key}-rel`);
const values = (radios: Radio[]) => radios.map((r) => r.value).join(",");
const checkedValue = (radios: Radio[]) => radios.filter((r) => r.checked).map((r) => r.value).join(",");

const INTRO = "Every player takes their own seat. Add everyone now and pay once.";
type Invite = { name: string | null; relationship: string } | null;

/**
 * Step 1 as the wizard renders it signed out: the blocks it starts on (with
 * any added after them), read through the group's choices, then drawn.
 */
function signupStep(group: ProgramGroup | null, invite: Invite = null, added: GuestParticipant[] = []) {
  const start = signupStart(invite);
  const signup: SignupWho = { youth: isYouthGroup(group), selfKey: start.selfKey };
  const value = signupValue(signup, { ...start.value, guests: [...start.value.guests, ...added] });
  const html = render({ value, signup, multiple: true, signInHref: "/login", intro: INTRO });
  const firstKey = value.guests[0].key;
  return { signup, value, html, firstKey, radios: radiosIn(html), words: words(html) };
}

const mustGroup = (id: string): ProgramGroup => {
  const g = groupById(id);
  if (!g) throw new Error(`no group ${id}`);
  return g;
};
const YOUTH = ["youth-7-10", "youth-11-15", "high-performance"].map(mustGroup);
const ADULT = ["adult-newer", "adult-intermediate", "adult-advanced"].map(mustGroup);
const ANY_AGE = mustGroup("private-lessons");

const noAgeOrLevel = (html: string) =>
  !html.includes("<select") &&
  !/How old (are|is)/.test(words(html)) &&
  !/Where's (your|their) game/.test(words(html)) &&
  !/id="guest-[^"]+-(age|level)"/.test(html);

// ── 1. What a youth group is ────────────────────────────────────────────────
console.log("1. A youth group is one whose oldest age is under 18");
check("the three youth groups are youth groups", () => YOUTH.every((g) => isYouthGroup(g)));
check("the adult groups, the any-age group and no group at all are not", () =>
  [...ADULT, ANY_AGE].every((g) => !isYouthGroup(g)) && !isYouthGroup(null) && !isYouthGroup(undefined)
);
check("the edge: oldest 17 is youth, oldest 18 is not", () =>
  isYouthGroup({ ageMax: 17 }) && !isYouthGroup({ ageMax: 18 })
);

// ── 2. A youth group ────────────────────────────────────────────────────────
console.log("2. A youth group: My child and Someone else, starting on My child, no age asked");
for (const group of YOUTH) {
  const step = lazy(() => signupStep(group));
  const own = () => blockRadios(step().radios, step().firstKey);
  check(`${group.name}: the choices are My child and Someone else, in that order`, () => values(own()) === "child,other");
  check(`${group.name}: the block starts on My child`, () =>
    checkedValue(own()) === "child" && step().value.guests[0].relationship === "child"
  );
  check(`${group.name}: no Myself and no My spouse or partner on screen`, () =>
    !step().words.includes(RELATIONSHIP_LABELS.self) && !step().words.includes(RELATIONSHIP_LABELS.spouse)
  );
  check(`${group.name}: nobody is asked How old are you? (no age group, no level)`, () =>
    noAgeOrLevel(step().html) && !step().words.includes("How old are you?")
  );
  check(`${group.name}: the name comes after the tap, labelled for a child`, () =>
    step().words.includes("Your child's full name") &&
    step().words.indexOf("Who is this?") < step().words.indexOf("Your child's full name") &&
    step().html.includes(`placeholder="Your child&#x27;s name"`)
  );
  check(`${group.name}: + Add another child`, () =>
    step().words.includes("+ Add another child") && !step().words.includes("+ Add another person")
  );
}
{
  const step = lazy(() => signupStep(YOUTH[0], null, [{ ...emptyGuest("child"), key: "added" }]));
  check("an added block on a youth group starts on My child, with the same two choices", () =>
    values(blockRadios(step().radios, "added")) === "child,other" &&
    checkedValue(blockRadios(step().radios, "added")) === "child"
  );
}

// ── 3. The one exception: an invitation for the holder themselves ───────────
console.log("3. Myself stays on a youth group only for an invitation that says self");
{
  const youth = mustGroup("high-performance");
  const step = lazy(() =>
    signupStep(youth, { name: "Sam Lee", relationship: "self" }, [{ ...emptyGuest("child"), key: "sibling" }])
  );
  const own = () => blockRadios(step().radios, step().firstKey);
  check("the invited block offers Myself, My child and Someone else, and starts on Myself with the invited name", () =>
    values(own()) === "self,child,other" && checkedValue(own()) === "self" && step().value.guests[0].name === "Sam Lee"
  );
  check("…and its name reads Your full name", () => step().words.includes("Your full name"));
  check("…but a block added beside it never offers Myself", () =>
    values(blockRadios(step().radios, "sibling")) === "child,other"
  );

  const child = lazy(() => signupStep(youth, { name: "Leo Chen", relationship: "child" }));
  check("an invitation for a child starts on My child", () =>
    checkedValue(blockRadios(child().radios, child().firstKey)) === "child" && !child().words.includes("Myself")
  );
  const other = lazy(() => signupStep(youth, { name: "Ana Diaz", relationship: "other" }));
  check("an invitation for someone else keeps Someone else, which a youth group offers", () =>
    checkedValue(blockRadios(other().radios, other().firstKey)) === "other"
  );
  const spouse = lazy(() => signupStep(youth, { name: "Kim Park", relationship: "spouse" }));
  check("an invitation for a spouse on a youth group starts on My child: the group offers no spouse", () =>
    spouse().value.guests[0].relationship === "child" &&
    values(blockRadios(spouse().radios, spouse().firstKey)) === "child,other"
  );
}

// ── 4. Any other group ──────────────────────────────────────────────────────
console.log("4. Any other group: all four choices, starting on Myself");
for (const group of [...ADULT, ANY_AGE, null]) {
  const label = group?.name ?? "No matching group";
  const step = lazy(() => signupStep(group));
  const own = () => blockRadios(step().radios, step().firstKey);
  check(`${label}: all four choices in the usual order, starting on Myself`, () =>
    values(own()) === "self,child,spouse,other" && checkedValue(own()) === "self"
  );
  check(`${label}: the labels are RELATIONSHIP_LABELS'`, () =>
    (["self", "child", "spouse", "other"] as const).every((r) => step().words.includes(RELATIONSHIP_LABELS[r]))
  );
  check(`${label}: Your full name, + Add another person, and no age group or level`, () =>
    step().words.includes("Your full name") &&
    step().html.includes(`placeholder="Your name"`) &&
    step().words.includes("+ Add another person") &&
    !step().words.includes("+ Add another child") &&
    noAgeOrLevel(step().html)
  );
}
{
  const step = lazy(() =>
    signupStep(ADULT[1], null, [
      { ...emptyGuest("child"), key: "kid" },
      { ...emptyGuest("spouse"), key: "partner" },
      { ...emptyGuest("other"), key: "friend" },
    ])
  );
  check("an added block starts as it does today, on My child", () =>
    checkedValue(blockRadios(step().radios, "kid")) === "child"
  );
  const nameLabel = (key: string) => {
    const m = new RegExp(`<label[^>]*for="guest-${key}-name"[^>]*>([^<]*)</label>`).exec(step().html);
    return m ? words(m[1]) : "";
  };
  check("the name label follows the choice: Your child's full name, then Their full name for a partner and someone else", () =>
    nameLabel("kid") === "Your child's full name" &&
    nameLabel("partner") === "Their full name" &&
    nameLabel("friend") === "Their full name" &&
    nameLabel(step().firstKey) === "Your full name"
  );
}

// ── 5. The choices are real radios ──────────────────────────────────────────
console.log("5. The choices: native radios in a fieldset, 44px cards, keyboard and screen reader");
{
  const step = lazy(() => signupStep(ADULT[0]));
  const own = () => blockRadios(step().radios, step().firstKey);
  const cards = () => [...step().html.matchAll(/<label\b([^>]*)>\s*<input\b[^>]*type="radio"/g)].map((m) => m[1]);
  check("four native radio inputs sharing the block's one name", () =>
    own().length === 4 && own().every((r) => r.name === `guest-${step().firstKey}-rel`)
  );
  check("…in a fieldset whose legend asks Who is this?", () =>
    /<fieldset[^>]*>\s*<legend[^>]*>Who is this\?<\/legend>/.test(step().html)
  );
  check("each radio sits in its label, a 44px card", () =>
    cards().length === 4 && cards().every((attrs) => attrs.includes("min-h-[44px]"))
  );
  check("the radio stays in the tab order and the accessibility tree (visually hidden, never display:none)", () =>
    own().every((r) => /class="sr-only"/.test(r.tag) && !/tabindex="-1"/.test(r.tag) && !/\shidden[\s=>]/.test(r.tag))
  );
  check("a keyboard focus shows on the card, and the tick is decoration", () =>
    cards().every((attrs) => attrs.includes("has-[input:focus-visible]:ring-2")) &&
    (step().html.match(/<span aria-hidden="true" class="flex h-5 w-5/g) ?? []).length === 4
  );
  // Forced colors (Windows High Contrast) drop the ring, a box shadow. The
  // card also takes the transparent 2px outline a focused button gets from
  // FOCUS_RING's focus:outline-none, which forced colors draw; it is
  // invisible otherwise, so the normal look is unchanged.
  check("in forced colors the focused card keeps a visible outline: the buttons' transparent one", () =>
    cards().every((attrs) =>
      [
        "has-[input:focus-visible]:outline ",
        "has-[input:focus-visible]:outline-2 ",
        "has-[input:focus-visible]:outline-offset-2 ",
        "has-[input:focus-visible]:outline-transparent",
      ].every((cls) => attrs.includes(cls))
    )
  );
}

// ── 6. Ages: the date of birth alone ────────────────────────────────────────
console.log("6. Ages: a typed player's under-18 flag is the date of birth's alone");
{
  const today = new Date(2026, 10, 26);
  check("the age from a date of birth, by the calendar", () =>
    computeAge("1990-04-12", today) === 36 &&
    computeAge("2012-05-01", today) === 14 &&
    computeAge("", today) === null &&
    computeAge("not a date", today) === null
  );
  check("a typed date of birth under 18 marks the player a minor", () => dobIsMinor("2012-05-01", today));
  check("eighteen today is not a minor; eighteen tomorrow still is", () =>
    !dobIsMinor("2008-11-26", today) && dobIsMinor("2008-11-27", today)
  );
  check("no date, or not a date, marks nobody a minor", () => !dobIsMinor("", today) && !dobIsMinor("31/02/2010", today));

  // The trap: a My child block still carries the band its relationship
  // assumes (junior, so isMinor true). It must never be the one in charge.
  const grownChild: GuestParticipant = { ...emptyGuest("child"), key: "grown", name: "Alex Chen" };
  check("(the premise) a My child block carries a junior band that says minor", () =>
    grownChild.ageBand === "junior" && grownChild.isMinor === true
  );
  check("a grown child on an adult group is not a minor: their date of birth says so", () => !dobIsMinor("1994-02-03", today));

  // Step 1, as the wizard runs it signed out, for that grown child.
  const adult = mustGroup("adult-intermediate");
  const asShown = (guests: GuestParticipant[]) =>
    signupValue({ youth: false, selfKey: null }, { ...EMPTY_HOUSEHOLD, guests });
  const stepOne = (guests: GuestParticipant[]) =>
    whoStepIssues({
      value: asShown(guests),
      signedIn: false,
      participants: [],
      disabledReasons: {},
      seatsRemaining: 6,
      players: guests
        .filter((g) => g.name.trim())
        .map((g) => ({ key: g.key, name: g.name, dob: "", participantId: null, relationship: g.relationship, isMinor: false })),
    });
  check("(the premise) that assumed band is outside an adult group's ages: the old step 1 stopped them on it", () =>
    ageBandBlock(adult, grownChild.ageBand) !== null
  );
  check("…and is not stopped at step 1: the wizard's step-1 list raises nothing for them", () =>
    stepOne([grownChild]).length === 0
  );
  check("…while the same list still stops a block with no name", () =>
    stepOne([{ ...grownChild, name: "" }]).some((i) => i.message === "Add the player's full name.")
  );
  check("(the premise) the chooser's own issues never read an age", () =>
    householdIssues({ ...EMPTY_HOUSEHOLD, guests: [grownChild] }, false, []).length === 0
  );
}

// ── 7. The wizard's wiring ──────────────────────────────────────────────────
console.log("7. The sign-up page wires it, and nothing else does");
{
  const wizard = read("src/app/enroll/[cohortId]/EnrollWizard.tsx");
  check("the wizard reads the group's kind, starts the blocks and passes the choices to the chooser", () =>
    wizard.includes("isYouthGroup(group)") &&
    wizard.includes("signupStart(") &&
    wizard.includes("signupValue(signup, who)") &&
    wizard.includes("signup={signup}")
  );
  check("…and every typed block it posts or checks is the one on screen", () =>
    /return whoStepIssues\(\{\s*value: chooserValue,/.test(wizard) &&
    wizard.includes("const out = householdIssues(value, signedIn, participants);") &&
    wizard.includes(": chooserValue.guests") &&
    wizard.includes("value={chooserValue}")
  );
  check("step 1 runs no age-band check on a typed player (the signed-in rows keep theirs)", () =>
    !wizard.includes("ageBandBlock(group, g.ageBand)") &&
    !wizard.includes("change the age group") &&
    wizard.includes("ageBandBlock(group, band)")
  );
  check("a typed player's under-18 flag is the date of birth's: no hidden band or flag is read", () =>
    wizard.includes('isMinor: dobIsMinor(dobs[g.key] ?? "")') && !/\bg\.(isMinor|ageBand)\b/.test(wizard)
  );
  check("on a youth group the guardian block is on screen from the start of step 2", () =>
    wizard.includes("(!household.signedIn && youthGroup) ||")
  );
  check("step 2's date-of-birth check is the age check", () => wizard.includes("dobAgeError(group, age)"));
  const quiz = read("src/app/intake/page.tsx");
  const booking = read("src/app/assessment/book/page.tsx");
  check("the quiz and the booking pass no sign-up choices", () => !quiz.includes("signup=") && !booking.includes("signup="));

  // + Add another child / person: focus moves to the new block (it may not
  // stay on a button that just moved). On the sign-up page that is the new
  // block's chosen card, which comes first there, so a phone opens no
  // keyboard over a name field; the quiz keeps its name field.
  const chooser = read("src/components/participants/WhoIsThisFor.tsx");
  check("after an add, focus goes to the new block's chosen Who is this? card on the sign-up page, and to its name field elsewhere", () =>
    chooser.includes("const choiceFirst = Boolean(signup) && !signedIn;") &&
    chooser.includes("document.querySelector<HTMLElement>(`input[name=\"guest-${focusKey}-rel\"]:checked`)") &&
    chooser.includes(": document.getElementById(`guest-${focusKey}-name`);") &&
    chooser.includes("}, [focusKey, choiceFirst]);") &&
    /<input\s+type="radio"\s+name=\{name\}/.test(chooser) &&
    chooser.includes("name={`${id}-rel`}")
  );
}

// ── 8. The quiz and the booking keep their blocks ───────────────────────────
console.log("8. The quiz's guest block still asks the age and level; the booking's is unchanged");
{
  const quizBlock = { ...emptyGuest("self"), key: "quiz" };
  const quiz = render({ value: { ...EMPTY_HOUSEHOLD, guests: [quizBlock] }, multiple: true, collectProfile: true, addInline: true });
  const quizWords = words(quiz);
  check("quiz: Full name, then Who is this? as a select with all four", () =>
    quizWords.includes("Full name") &&
    quiz.includes(`<select id="guest-quiz-rel"`) &&
    (["self", "child", "spouse", "other"] as Relationship[]).every((r) => quiz.includes(`<option value="${r}"`)) &&
    radiosIn(quiz).length === 0
  );
  check("quiz: the age band (How old are you?) and the level, required", () =>
    quiz.includes(`<select id="guest-quiz-age"`) &&
    quizWords.includes("How old are you?") &&
    quiz.includes(`<select id="guest-quiz-level"`) &&
    quizWords.includes("Where's your game right now?") &&
    quizWords.includes("Choose one…")
  );
  check("quiz: + Add another person", () => quizWords.includes("+ Add another person"));

  const bookingBlock = { ...emptyGuest("self"), key: "book" };
  const booking = render({
    value: { ...EMPTY_HOUSEHOLD, guests: [bookingBlock] },
    signInHref: "/login?next=%2Fassessment%2Fbook",
    intro: "One assessment, one player.",
  });
  const bookingWords = words(booking);
  check("booking: Full name, Who is this? as a select, the age band and the optional level", () =>
    bookingWords.includes("Full name") &&
    booking.includes(`<select id="guest-book-rel"`) &&
    booking.includes(`<select id="guest-book-age"`) &&
    bookingWords.includes("How old are you?") &&
    booking.includes(`<select id="guest-book-level"`) &&
    bookingWords.includes("Where's your game right now? (optional)") &&
    radiosIn(booking).length === 0
  );
  check("booking: one player, so no add button; the sign-in line stays", () =>
    !bookingWords.includes("+ Add another") && bookingWords.includes("Have an account?")
  );
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll sign-up who checks passed.");
