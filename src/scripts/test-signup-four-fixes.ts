// Run from project root: npx tsx src/scripts/test-signup-four-fixes.ts
//
// Pins backlog #101, four fixes on the sign-up path:
//   1. "Pay by card instead" shows only while card payments are live: in test
//      mode the e-transfer step has no card button and the e-transfer email no
//      card line (HTML and text). The server decides, from its own settings.
//   2. Signed in on a youth group the chooser never starts on an adult: the
//      one child who fits when exactly one does, else nobody.
//   3. On a youth group step 2 asks the email and phone once: the account
//      holder's are the guardian's unless "The parent or guardian is someone
//      else" opens the guardian's own.
//   4. After an e-transfer, signed out, the page after shows the amount, the
//      address and the message as the step showed them, carried in the tab's
//      session storage and never in the URL.
//
// The repo has no DOM test runner: components are rendered to static markup
// and the wiring is read from source. No network, no database. Exits
// non-zero on any failure.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cardPaymentIsLive } from "../lib/payments";
import { buildEtransferInstructionsEmail } from "../lib/emailBodies";
import {
  GUARDIAN_OTHER_LABEL,
  guardianContact,
  guardianHint,
  initialSelection,
  youthPreselectIds,
} from "../lib/enrollPlayers";
import {
  etransferHandoffKey,
  parseEtransferDetails,
  readEtransferRaw,
  saveEtransferDetails,
  type EtransferDetails,
  type HandoffStorage,
} from "../lib/etransferHandoff";
import {
  EtransferStep,
  RegistrantStep,
  etransferStepDetails,
  type EnrollPlayer,
  type FormState,
} from "../app/enroll/[cohortId]/EnrollWizard";
import {
  ETRANSFER_MEMO_NOTE,
  EtransferDetailsFromStep,
  EtransferDetailsSection,
} from "../components/enroll/EtransferDetails";
import {
  WAY_BACK_LINE,
  WAY_BACK_NEW_LINK,
  WAY_BACK_SIGN_IN,
  enrollConfirmation,
} from "../lib/paymentConfirmation";
import { groupById } from "../content/programs";
import type { ProgramGroup } from "../types/program";
import type { AgeBand } from "../lib/ageBand";

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

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");

/** The words a piece of markup shows, in order. */
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const mustGroup = (id: string): ProgramGroup => {
  const g = groupById(id);
  if (!g) throw new Error(`no group ${id}`);
  return g;
};

const wizard = read("src/app/enroll/[cohortId]/EnrollWizard.tsx");
const enrollPage = read("src/app/enroll/[cohortId]/page.tsx");
const confirmedPage = read("src/app/enroll/[cohortId]/confirmed/page.tsx");
const chooser = read("src/components/participants/WhoIsThisFor.tsx");
const actions = read("src/lib/cohortActions.ts");

// ── 1. The card offer ───────────────────────────────────────────────────────
console.log("1. Pay by card instead: only while card payments are live");
{
  check("live means Stripe with a live key, and nothing else", () =>
    cardPaymentIsLive({ stripeKey: "sk_live_x", vercelEnv: "production" }) &&
    cardPaymentIsLive({ stripeKey: "rk_live_x", vercelEnv: "production" }) &&
    !cardPaymentIsLive({ stripeKey: "sk_test_x", vercelEnv: "production" }) &&
    !cardPaymentIsLive({ stripeKey: "rk_test_x", vercelEnv: "preview" }) &&
    // Mock mode (no key outside production) and production with no key.
    !cardPaymentIsLive({ stripeKey: "", vercelEnv: "preview" }) &&
    !cardPaymentIsLive({ stripeKey: undefined, vercelEnv: undefined }) &&
    !cardPaymentIsLive({ stripeKey: "", vercelEnv: "production" })
  );

  const details: EtransferDetails = {
    amount: "$200 CAD",
    breakdown: null,
    recipientEmail: "pay@example.test",
    memo: "Maya Chen – Winter A",
  };
  const step = (cardOffer: boolean) =>
    renderToStaticMarkup(
      createElement(EtransferStep, { details, cardOffer, submitting: false, onPayByCard: () => undefined })
    );
  check("test mode: the step has no card button and no word of a card", () => {
    const html = step(false);
    return !/card/i.test(words(html)) && (html.match(/<button/g) ?? []).length === 2; // the two Copy buttons
  });
  check("…and still shows the amount, the address and the message", () => {
    const w = words(step(false));
    return w.includes("$200 CAD") && w.includes("pay@example.test") && w.includes("Maya Chen – Winter A");
  });
  check("live: the card button is back, in today's words", () =>
    words(step(true)).includes("Prefer to pay by card? Pay by card instead")
  );

  check("the server decides: the page hands the wizard its own payment settings' answer", () =>
    enrollPage.includes("cardOffer: cardPaymentIsLive(),") &&
    enrollPage.includes('import { cardPaymentIsLive } from "@/lib/payments";')
  );
  check("…and the step reads only that: nothing from the address bar, a cookie or storage", () =>
    wizard.includes("cardOffer={etransfer.cardOffer === true}") &&
    (wizard.match(/cardOffer/g) ?? []).length >= 3 &&
    !/useSearchParams|document\.cookie|location\.search/.test(wizard)
  );
  check("the wizard never asks the payment settings itself (a client bundle has no key to read)", () =>
    !wizard.includes("@/lib/payments") && !wizard.includes("process.env")
  );

  const email = (cardUrl: string | null) =>
    buildEtransferInstructionsEmail({
      firstName: "Maya",
      programTitle: "Youth Bootcamps",
      cohortLabel: "Winter A",
      priceCents: 20000,
      creditCents: 0,
      amountCents: 20000,
      recipientEmail: "pay@example.test",
      memo: "Maya Chen – Winter A",
      cardUrl,
    });
  const url = "https://tennisbootcamp.ca/enroll/c1?invite=tok123";
  check("test mode: the email's HTML has no card line and no enroll link", () => {
    const html = email(null).html;
    return !/pay by card/i.test(html) && !html.includes("/enroll/") && html.includes("Refund terms:");
  });
  check("test mode: the email's text has no card line and no enroll link", () => {
    const text = email(null).text;
    return !/card/i.test(text) && !text.includes("/enroll/") && text.includes("Refund terms: ");
  });
  check("test mode: nothing else in the email moved", () => {
    const strip = (s: string) => s.replace(/Prefer to pay by card\?[^\n]*?(Refund terms)/, "$1").replace(/Prefer to pay by card\? \S+\n/, "");
    return strip(email(url).html) === email(null).html && strip(email(url).text) === email(null).text;
  });
  check("live: the HTML's card sentence is back, as it was", () =>
    email(url).html.includes(`Prefer to pay by card? <a href="${url}"`) &&
    email(url).html.includes(">Pay by card instead</a>. Refund terms:")
  );
  check("live: the text's card line is back, as it was", () =>
    email(url).text.includes(`Prefer to pay by card? ${url}\nRefund terms: `)
  );
  check("the sender decides the same way, on the server: no card link while card payments are not live", () =>
    /const cardUrl = !cardPaymentIsLive\(\)\s*\? null/.test(actions) &&
    actions.includes('import { cardPaymentIsLive } from "@/lib/payments";') &&
    actions.startsWith('import "server-only";')
  );
}

// ── 2. The chooser's start, signed in ───────────────────────────────────────
console.log("2. Signed in on a youth group: never an adult ticked; the one child who fits, else nobody");
{
  type P = { id: string; relationship: string; isMinor: boolean; ageBand?: AgeBand | null };
  const holder: P = { id: "holder", relationship: "self", isMinor: false, ageBand: "adult" };
  const holderNoBand: P = { id: "holder", relationship: "self", isMinor: false, ageBand: null };
  const junior: P = { id: "junior", relationship: "child", isMinor: true, ageBand: "junior" };
  const junior2: P = { id: "junior2", relationship: "child", isMinor: true, ageBand: "junior" };
  const teen: P = { id: "teen", relationship: "child", isMinor: true, ageBand: "teen" };
  const minorNoBand: P = { id: "kid", relationship: "child", isMinor: true };
  const spouse: P = { id: "spouse", relationship: "spouse", isMinor: false };

  const youth = mustGroup("youth-7-10");
  const start = (
    group: ProgramGroup | null,
    participants: P[],
    opts: { blocked?: string[]; locked?: string[] } = {}
  ) =>
    initialSelection({
      participants,
      canPick: (id) => !(opts.blocked ?? []).includes(id),
      locked: (id) => (opts.locked ?? []).includes(id),
      youthIds: youthPreselectIds(group, participants),
    });

  check("the holder and one child who fits: the child, not the holder", () => start(youth, [holder, junior]) === "junior");
  check("a holder with no age on file is still never the start (the old start ticked them)", () =>
    start(youth, [holderNoBand, junior]) === "junior" && start(youth, [holderNoBand]) === null
  );
  check("the holder alone, or with a partner: nobody", () =>
    start(youth, [holder]) === null && start(youth, [holderNoBand, spouse]) === null
  );
  check("two children who fit: nobody, and the holder chooses", () => start(youth, [holder, junior, junior2]) === null);
  check("one child fits and one is outside the group's ages: the one who fits", () =>
    start(youth, [holder, teen, junior]) === "junior"
  );
  check("a teen on the 7–10 group fits nowhere: nobody", () => start(youth, [holder, teen]) === null);
  check("a child with no age band on file counts while they are under 18", () => start(youth, [holderNoBand, minorNoBand]) === "kid");
  check("the one child who fits is already in the group: nobody", () => start(youth, [holder, junior], { blocked: ["junior"] }) === null);
  check("an invitation's player is always the start", () =>
    start(youth, [holder, junior, junior2], { locked: ["junior2"] }) === "junior2"
  );
  check("every youth group follows the rule", () =>
    ["youth-7-10", "youth-11-15", "high-performance"].every((id) => {
      const ids = youthPreselectIds(mustGroup(id), [holder, holderNoBand, spouse]);
      return Array.isArray(ids) && ids.length === 0;
    })
  );
  for (const id of ["adult-newer", "adult-intermediate", "adult-advanced", "private-lessons"]) {
    check(`${mustGroup(id).name}: unchanged, the holder is the start`, () =>
      youthPreselectIds(mustGroup(id), [holder, junior]) === null && start(mustGroup(id), [junior, holder]) === "holder"
    );
  }
  check("no group, or no holder on the account: unchanged, the first player who can be picked", () =>
    youthPreselectIds(null, [holder]) === null && start(null, [junior, teen]) === "junior" && start(null, [junior, teen], { blocked: ["junior"] }) === "teen"
  );
  check("the chooser starts through this rule, and the wizard hands it the group's fit", () =>
    chooser.includes("const first = initialSelection({ participants, canPick, locked, youthIds: youthPreselectIds });") &&
    chooser.includes("onChange({ ...value, selectedIds: [first] });") &&
    !chooser.includes('pickable.find((p) => p.relationship === "self")') &&
    wizard.includes("youthPreselectIds={youthPreselectIds(group, household.participants)}")
  );
  check("with nobody ticked the step still asks to choose", () =>
    chooser.includes('message: "Choose who this is for, or add someone."')
  );
}

// ── 3. Step 2 asks the email and phone once ─────────────────────────────────
console.log("3. Youth step 2: one email and one phone; the guardian's posted from them");
{
  const form: FormState = {
    participantName: "",
    participantDob: "",
    contactEmail: "parent@example.test",
    contactPhone: "6475550101",
    guardianName: "Dana Chen",
    guardianEmail: "",
    guardianPhone: "",
    guardianIsOther: false,
    consentChecked: false,
    consentSignedName: "",
  };
  const players: EnrollPlayer[] = [
    { key: "p1", name: "Maya Chen", dob: "2016-03-09", participantId: null, relationship: "child", isMinor: true },
  ];
  const step = (over: { guardianOnce: boolean; other?: boolean; signedIn?: boolean; isMinor?: boolean }) =>
    renderToStaticMarkup(
      createElement(RegistrantStep, {
        form: { ...form, guardianIsOther: over.other ?? false },
        setForm: () => undefined,
        players,
        setPlayers: () => undefined,
        isMinor: over.isMinor ?? true,
        guardianOnce: over.guardianOnce,
        signedIn: over.signedIn ?? false,
        accountEmail: "parent@example.test",
        cohortId: "c1",
        onEnterSubmit: () => undefined,
        errors: {},
        group: mustGroup("youth-7-10"),
      })
    );
  const count = (html: string, type: string) => (html.match(new RegExp(`<input[^>]*type="${type}"`, "g")) ?? []).length;

  check("(the premise) off a youth group the guardian block asks a second email and phone", () => {
    const html = step({ guardianOnce: false });
    return count(html, "email") === 2 && count(html, "tel") === 2 && !words(html).includes(GUARDIAN_OTHER_LABEL);
  });
  check("youth group, signed out: one email and one phone on the step", () => {
    const html = step({ guardianOnce: true });
    return count(html, "email") === 1 && count(html, "tel") === 1;
  });
  check("…the guardian's name is still asked, with the one choice under it, unticked", () => {
    const html = step({ guardianOnce: true });
    const box = /<input[^>]*id="enroll-guardian-other"[^>]*>/.exec(html)?.[0] ?? "";
    return (
      html.includes('id="enroll-guardian-name"') &&
      /type="checkbox"/.test(box) &&
      !/\schecked(=""|[\s/>])/.test(box) &&
      words(html).includes("The parent or guardian is someone else") &&
      GUARDIAN_OTHER_LABEL === "The parent or guardian is someone else"
    );
  });
  check("…and it says who signs and where we reach them", () =>
    words(step({ guardianOnce: true })).includes(
      "The parent or guardian signs the waiver for every player under 18. We'll reach them at the email and phone above."
    ) && guardianHint(true).endsWith("the email and phone below.")
  );
  check("the choice is a native checkbox inside its label, a 44px card", () =>
    /<label class="[^"]*min-h-\[44px\][^"]*">\s*<input[^>]*id="enroll-guardian-other"/.test(step({ guardianOnce: true }))
  );
  check("someone else: the guardian's own email and phone open, after the choice", () => {
    const html = step({ guardianOnce: true, other: true });
    return (
      count(html, "email") === 2 &&
      count(html, "tel") === 2 &&
      html.indexOf('id="enroll-guardian-other"') < html.indexOf('id="enroll-guardian-email"') &&
      html.indexOf('id="enroll-guardian-email"') < html.indexOf('id="enroll-guardian-phone"') &&
      words(html).includes("We'll reach them at the email and phone below.")
    );
  });
  check("youth group, signed in: the account's email is shown, one phone asked, no second pair", () => {
    const html = step({ guardianOnce: true, signedIn: true });
    return count(html, "email") === 0 && count(html, "tel") === 1 && words(html).includes("parent@example.test");
  });
  check("no player under 18: no guardian block and no choice", () => {
    const html = step({ guardianOnce: false, isMinor: false });
    return !html.includes("enroll-guardian") && !words(html).includes(GUARDIAN_OTHER_LABEL);
  });

  const typed = { holderEmail: "parent@example.test", holderPhone: "6475550101", guardianEmail: "nana@example.test", guardianPhone: "4165550199" };
  check("posted: the guardian's email and phone are the holder's while the choice is unticked", () => {
    const g = guardianContact({ askOnce: true, other: false, ...typed });
    return g.email === "parent@example.test" && g.phone === "6475550101" && g.fromHolder;
  });
  check("posted: someone else posts the guardian's own", () => {
    const g = guardianContact({ askOnce: true, other: true, ...typed });
    return g.email === "nana@example.test" && g.phone === "4165550199" && !g.fromHolder;
  });
  check("posted: off a youth group the guardian's own fields, as before", () => {
    const g = guardianContact({ askOnce: false, other: false, ...typed });
    return g.email === "nana@example.test" && g.phone === "4165550199" && !g.fromHolder;
  });
  check("what the page posts keeps its fields, filled through that rule", () =>
    wizard.includes('guardianEmail: isMinor ? guardian.email : "",') &&
    wizard.includes('guardianPhone: isMinor ? guardian.phone : "",') &&
    wizard.includes("guardianEmail: isMinor ? guardian.email : undefined,") &&
    wizard.includes("guardianPhone: isMinor ? guardian.phone : undefined,") &&
    wizard.includes('guardianName: isMinor ? form.guardianName : "",') &&
    !/guardian(Email|Phone): isMinor \? form\./.test(wizard)
  );
  check("the rule is the youth group's, signed in or out, and the holder's contact is the one on the step", () =>
    /guardianContact\(\{\s*askOnce: youthGroup,\s*other: form\.guardianIsOther,\s*holderEmail: contactEmail,\s*holderPhone: form\.contactPhone,/.test(wizard) &&
    wizard.includes("guardianOnce={youthGroup}")
  );
  check("the guardian's own fields are checked only when they are on screen; the holder's always are", () =>
    wizard.includes("if (!guardian.fromHolder) {") &&
    wizard.includes("const ph = phoneError(form.contactPhone);")
  );
}

// ── 4. After an e-transfer: the details again, from the tab ─────────────────
console.log("4. After an e-transfer, signed out: the details as the step showed them, never in the URL");
{
  const store = (): HandoffStorage & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  };
  const one = etransferStepDetails({ cohort: { priceCents: 20000 }, seats: 1, creditCents: 0, recipientEmail: "pay@example.test", memo: "Maya Chen – Winter A" });
  const two = etransferStepDetails({ cohort: { priceCents: 20000 }, seats: 2, creditCents: 2000, recipientEmail: "pay@example.test", memo: "Maya Chen + Leo Chen – Winter A" });

  check("the step's amount is the price times the players, less the credit, in its own words", () =>
    one.amount === "$200 CAD" && one.breakdown === null &&
    two.amount === "$380 CAD" && two.breakdown === "$200 × 2 players − $20 assessment credit"
  );
  check("the amount needs its working for one player with a credit, too", () => {
    const d = etransferStepDetails({ cohort: { priceCents: 20000 }, seats: 1, creditCents: 2000, recipientEmail: "a@b.test", memo: "m" });
    return d.amount === "$180 CAD" && d.breakdown === "$200 − $20 assessment credit";
  });
  check("saved under the cohort's own key and read back whole", () => {
    const s = store();
    saveEtransferDetails(s, "c1", two);
    return (
      [...s.data.keys()].join() === etransferHandoffKey("c1") &&
      JSON.stringify(parseEtransferDetails(readEtransferRaw(s, "c1"))) === JSON.stringify(two) &&
      readEtransferRaw(s, "c2") === null
    );
  });
  check("nothing there (another device, a later visit), or not ours: no details", () =>
    parseEtransferDetails(null) === null &&
    parseEtransferDetails("") === null &&
    parseEtransferDetails("not json") === null &&
    parseEtransferDetails("[]") === null &&
    parseEtransferDetails(JSON.stringify({ amount: "$200 CAD", memo: "m" })) === null &&
    parseEtransferDetails(JSON.stringify({ amount: 200, recipientEmail: "a@b.test", memo: "m" })) === null &&
    parseEtransferDetails(JSON.stringify({ amount: "x".repeat(301), recipientEmail: "a@b.test", memo: "m" })) === null
  );
  check("a browser that refuses storage breaks nothing", () => {
    const refusing: HandoffStorage = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); },
    };
    saveEtransferDetails(refusing, "c1", one);
    saveEtransferDetails(null, "c1", one);
    return readEtransferRaw(refusing, "c1") === null && readEtransferRaw(null, "c1") === null;
  });

  const section = renderToStaticMarkup(createElement(EtransferDetailsSection, { details: two }));
  check("the page after draws the three rows and the note as the step does", () => {
    const w = words(section);
    const stepWords = words(
      renderToStaticMarkup(createElement(EtransferStep, { details: two, cardOffer: false, submitting: false, onPayByCard: () => undefined }))
    );
    const rows = "Amount $380 CAD $200 × 2 players − $20 assessment credit Send to pay@example.test Copy Message Maya Chen + Leo Chen – Winter A Copy";
    return w.includes(rows) && stepWords.includes(rows) && w.includes(ETRANSFER_MEMO_NOTE) && stepWords.includes(ETRANSFER_MEMO_NOTE);
  });
  check("…under a real heading", () => /<h2[^>]*>Your e-transfer details<\/h2>/.test(section));
  check("a stored value is drawn as text, never as markup", () => {
    const html = renderToStaticMarkup(
      createElement(EtransferDetailsSection, { details: { ...one, memo: '<img src=x onerror="1">' } })
    );
    return !html.includes("<img") && html.includes("&lt;img");
  });
  check("the server's markup carries none of it: the details are read in the browser, after hydration", () =>
    renderToStaticMarkup(createElement(EtransferDetailsFromStep, { cohortId: "c1" })) === ""
  );

  // The wizard: saved in the tab, then an address with nothing of them in it.
  const send = /async function sendEtransfer\(\) \{[\s\S]*?\n  \}\n/.exec(wizard)?.[0] ?? "";
  check("the step leaves them in the tab as it shows them, before it leaves the page", () =>
    send.includes("saveEtransferDetails(tabStorage(), cohort.id, etransferDetails);") &&
    send.indexOf("saveEtransferDetails(") < send.indexOf("window.location.href") &&
    wizard.includes("<EtransferStep\n              details={etransferDetails}")
  );
  check("the address after it carries only etransfer, the row number and the invite flag", () => {
    const sets = [...send.matchAll(/params\.set\("([a-z]+)"/g)].map((m) => m[1]).join();
    return (
      send.includes('new URLSearchParams({ etransfer: "1" })') &&
      sets === "row,invite" &&
      send.includes("window.location.href = `/enroll/${cohort.id}/confirmed?${params.toString()}`;") &&
      !/params\.set\([^)]*(memo|amount|recipient|name|email)/i.test(send)
    );
  });
  check("the confirmation page shows them only after an e-transfer, signed out, from the tab", () =>
    confirmedPage.includes('{viaEtransfer && !user && <EtransferDetailsFromStep cohortId={cohortId} className="mt-6" />}') &&
    confirmedPage.includes("searchParams: Promise<{ invite?: string | string[]; etransfer?: string | string[] }>") &&
    !/sp\.(memo|amount|to|name|email)/.test(confirmedPage)
  );
  check("with none in the tab, today's inbox line stays (it stays either way)", () => {
    const copy = enrollConfirmation({ viaEtransfer: true, testPayment: false, signedIn: false, firstName: null });
    return (
      copy.lead.includes("The amount, the address, and the message to put on the transfer are in your inbox.") &&
      confirmedPage.includes("{copy.lead}")
    );
  });
  const reader = read("src/components/enroll/EtransferDetails.tsx");
  const handoff = read("src/lib/etransferHandoff.ts");
  check("session storage only: it ends with the tab, and nothing else is written", () =>
    handoff.includes("window.sessionStorage") &&
    !handoff.includes("localStorage") &&
    !handoff.includes("cookie") &&
    !reader.includes("localStorage") &&
    reader.includes("() => null")
  );
}

// ── 5. Signed out, the way back in ──────────────────────────────────────────
console.log("5. Signed out, the page after: no main button to /login; the account email's link, then two quiet links");
{
  const conf = (over: Partial<Parameters<typeof enrollConfirmation>[0]>) =>
    enrollConfirmation({ viaEtransfer: false, testPayment: false, signedIn: false, firstName: null, ...over });
  const linkText = (c: ReturnType<typeof conf>) => (c.wayBack?.links ?? []).map((l) => `${l.label}>${l.href}`).join();

  for (const [label, c] of [
    ["after an e-transfer", conf({ viaEtransfer: true })],
    ["after a card payment", conf({})],
  ] as const) {
    check(`${label}: the line says where the dashboard opens from`, () =>
      c.wayBack?.line === WAY_BACK_LINE &&
      WAY_BACK_LINE.startsWith("Your dashboard opens from the link in the account email we just sent.")
    );
    check(`${label}: Sign in to /login, then Send a new link to /auth/forgot-password`, () =>
      linkText(c) === "Sign in>/login,Send a new link>/auth/forgot-password"
    );
  }
  check("the line stays true for an address that already had an account: no link is promised to it", () =>
    WAY_BACK_LINE.includes("An address that already had an account gets no link, so sign in with your password.")
  );
  check("the links' words are /login's own", () =>
    WAY_BACK_SIGN_IN.label === "Sign in" &&
    WAY_BACK_NEW_LINK.label === "Send a new link" &&
    read("src/app/login/page.tsx").includes("Send a new link") &&
    read("src/app/login/page.tsx").includes('href="/auth/forgot-password"')
  );
  check("a test payment promises no email: no line, no new-link offer, the plain Sign in alone", () => {
    const c = conf({ testPayment: true });
    return (
      c.wayBack !== null &&
      c.wayBack.line === null &&
      linkText(c) === "Sign in>/login" &&
      !/email|inbox|link/i.test([c.heading, c.badge, ...c.nextSteps, ...c.wayBack.links.map((l) => l.label)].join(" ")) &&
      c.lead.includes("no email was sent")
    );
  });
  check("signed in: no way-back block, in any state", () =>
    conf({ signedIn: true }).wayBack === null &&
    conf({ signedIn: true, viaEtransfer: true }).wayBack === null &&
    conf({ signedIn: true, testPayment: true }).wayBack === null
  );

  const lime = "bg-[#B4E655]";
  const mainButtons = [...confirmedPage.matchAll(/<Link\s+href="([^"]+)"\s+className="([^"]*)"/g)].filter((m) => m[2].includes(lime));
  check("the page has one lime button, the signed-in one to /dashboard, and no link to /login of its own", () =>
    mainButtons.length === 1 &&
    mainButtons[0][1] === "/dashboard" &&
    confirmedPage.includes("{user && (") &&
    !confirmedPage.includes('href="/login"') &&
    !confirmedPage.includes("Sign in to your dashboard")
  );
  check("the way back is drawn from those words as text links, never a button", () =>
    confirmedPage.includes("{copy.wayBack && (") &&
    confirmedPage.includes("{copy.wayBack.line}") &&
    confirmedPage.includes('<TextLink key={link.href} href={link.href} tone="lime">') &&
    !read("src/components/ui/TextLink.tsx").includes(lime)
  );
  check("nothing asks a route to send anything", () =>
    !confirmedPage.includes("fetch(") && !confirmedPage.includes("/api/auth/")
  );
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll sign-up four-fixes checks passed.");
