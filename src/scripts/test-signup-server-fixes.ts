// Run from project root: npx tsx src/scripts/test-signup-server-fixes.ts
//
// Pins backlog #102, three fixes on the sign-up path's server side:
//   1. Card checkout refuses an e-transfer block while card payments are not
//      live, before anything is created. A card-mode block in test mode, and
//      an e-transfer block once cards are live, are untouched.
//   2. On a youth group whose parent or guardian is someone else, step 2 asks
//      the account holder's own name and posts it as `accountName`; the
//      enroll route names the account from it before the guardian's.
//   3. The e-transfer paid check is per player: with some players already
//      paid the step and the page after show only what the others owe; with
//      every player paid the page says so and names no inbox.
//
// The repo has no DOM test runner: components are rendered to static markup
// and the wiring is read from source. No network, no database. Exits
// non-zero on any failure.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cardPaymentIsLive } from "../lib/payments";
import { ETRANSFER_ONLY_ERROR, cardRailRefusal, guestSeatForPlayer, paidSeatNamesPlayer } from "../lib/enrollGate";
import { enrollHolderName } from "../lib/guestAccount";
import { HOLDER_NAME_HINT, HOLDER_NAME_LABEL, asksHolderName, postedHolderName } from "../lib/enrollPlayers";
import { FIELD_MESSAGES } from "../lib/formValidation";
import {
  etransferTally,
  settledFromAnswer,
  shouldSaveEtransferDetails,
} from "../lib/etransferHandoff";
import {
  ETRANSFER_ALL_PAID_BADGE,
  ETRANSFER_ALL_PAID_HEADING,
  ETRANSFER_ALL_PAID_LINE,
  ETRANSFER_ALL_PAID_NEXT,
  ETRANSFER_ALL_PAID_NO_EMAIL,
  enrollConfirmation,
} from "../lib/paymentConfirmation";
import {
  EtransferStep,
  RegistrantStep,
  alreadyPaidNote,
  etransferDetailsStillDue,
  etransferStepDetails,
  type EnrollPlayer,
  type FormState,
} from "../app/enroll/[cohortId]/EnrollWizard";
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
const checkout = read("src/app/api/checkout/route.ts");
const enrollRoute = read("src/app/api/enroll/route.ts");
const etransferRoute = read("src/app/api/enroll/etransfer/route.ts");
const confirmedPage = read("src/app/enroll/[cohortId]/confirmed/page.tsx");
const actions = read("src/lib/cohortActions.ts");

// ── 1. No test card checkout on an e-transfer block ─────────────────────────
console.log("1. Card checkout on an e-transfer block: refused while card payments are not live");
{
  const TEST = { stripeKey: "sk_test_x", vercelEnv: "production" };
  const LIVE = { stripeKey: "sk_live_x", vercelEnv: "production" };
  const MOCK = { stripeKey: "", vercelEnv: "preview" };
  const etransfer = { paymentMode: "etransfer" as const };
  const card = { paymentMode: "card" as const };

  check("an e-transfer block with a test key: refused, 409, in the route's own words", () => {
    const r = cardRailRefusal(etransfer, cardPaymentIsLive(TEST));
    return r?.status === 409 && r.error === ETRANSFER_ONLY_ERROR;
  });
  check("…and in mock mode, with a restricted test key, or with no key at all", () =>
    cardRailRefusal(etransfer, cardPaymentIsLive(MOCK)) !== null &&
    cardRailRefusal(etransfer, cardPaymentIsLive({ stripeKey: "rk_test_x", vercelEnv: "preview" })) !== null &&
    cardRailRefusal(etransfer, cardPaymentIsLive({ stripeKey: undefined, vercelEnv: undefined })) !== null
  );
  check("an e-transfer block with a live key: allowed, as before", () =>
    cardRailRefusal(etransfer, cardPaymentIsLive(LIVE)) === null &&
    cardRailRefusal(etransfer, cardPaymentIsLive({ stripeKey: "rk_live_x", vercelEnv: "production" })) === null
  );
  check("a card-mode block in test mode: allowed, as before", () =>
    cardRailRefusal(card, cardPaymentIsLive(TEST)) === null &&
    cardRailRefusal(card, cardPaymentIsLive(MOCK)) === null &&
    cardRailRefusal(card, cardPaymentIsLive(LIVE)) === null
  );
  check("a block with no payment mode stored is a card block (migration 0006 not run)", () =>
    cardRailRefusal({}, false) === null && cardRailRefusal({ paymentMode: undefined }, false) === null
  );
  check("no block at all is the gate's 404, never this refusal", () =>
    cardRailRefusal(null, false) === null && cardRailRefusal(undefined, false) === null
  );
  check("the line says what is true and points at the e-transfer step", () =>
    ETRANSFER_ONLY_ERROR.includes("paid by e-transfer") &&
    ETRANSFER_ONLY_ERROR.includes("we didn't start a card payment") &&
    ETRANSFER_ONLY_ERROR.includes("nothing was charged") &&
    ETRANSFER_ONLY_ERROR.endsWith("shown on the e-transfer step.") &&
    !ETRANSFER_ONLY_ERROR.includes("!") &&
    !/test mode|stripe/i.test(ETRANSFER_ONLY_ERROR)
  );

  const at = checkout.indexOf("const etransferOnly = cardRailRefusal(cohort, cardPaymentIsLive());");
  check("the route runs it on the stored block and the server's own payment settings", () =>
    at > 0 &&
    checkout.includes("return NextResponse.json({ error: etransferOnly.error }, { status: etransferOnly.status });") &&
    checkout.includes("const cohort = await getCohortById(cohortId);")
  );
  check("nothing the browser sent reaches the check", () => {
    const call = /cardRailRefusal\(([^)]*\)?)\);/.exec(checkout)?.[1] ?? "";
    return call === "cohort, cardPaymentIsLive()" && !/body|enrollmentMeta|req\./.test(call);
  });
  check("…after the rail, gate, approval and price checks", () =>
    [
      'if (rail === "refuse")',
      "const refused = gateRefusal(gate);",
      "const byApproval = approvalRefusal(cohort, gate);",
      "const noPrice = priceRefusal(cohort);",
    ].every((earlier) => checkout.indexOf(earlier) > 0 && checkout.indexOf(earlier) < at)
  );
  check("…and before anything is created: no counted try, row, credit, coupon or Stripe session", () =>
    [
      "checkSubmissionLimit(req",
      "readEnrollmentSheet()",
      "creditsForSeats({",
      "saveEnrollmentToSupabase({",
      "createCheckoutSession({",
      "flipPaymentRows({",
      "res.cookies.set(",
    ].every((later) => checkout.indexOf(later) > at)
  );
  check("the wizard shows a 409's own words, with the info@ fallback", () =>
    wizard.includes("res.status !== 409") && wizard.includes("setSubmitError(withHumanFallback(msg.slice(\"refused:\".length)));")
  );
  check("the e-transfer route is untouched by it", () => !etransferRoute.includes("cardRailRefusal"));
}

// ── 2. The account in its holder's name ─────────────────────────────────────
console.log("2. Youth group, the guardian is someone else: the holder's own name asked, posted and kept");
{
  const form: FormState = {
    participantName: "",
    participantDob: "",
    contactEmail: "holder@example.com",
    contactPhone: "6475550101",
    guardianName: "Dana Chen",
    guardianEmail: "dana@example.com",
    guardianPhone: "4165550199",
    guardianIsOther: false,
    holderName: "",
    consentChecked: false,
    consentSignedName: "",
  };
  const players: EnrollPlayer[] = [
    { key: "p1", name: "Maya Chen", dob: "2016-03-09", participantId: null, relationship: "child", isMinor: true },
  ];
  const step = (over: {
    guardianOnce: boolean;
    other?: boolean;
    isMinor?: boolean;
    errors?: Record<string, string>;
    holderName?: string;
  }) =>
    renderToStaticMarkup(
      createElement(RegistrantStep, {
        form: { ...form, guardianIsOther: over.other ?? false, holderName: over.holderName ?? "" },
        setForm: () => undefined,
        players,
        setPlayers: () => undefined,
        isMinor: over.isMinor ?? true,
        guardianOnce: over.guardianOnce,
        signedIn: false,
        accountEmail: "",
        cohortId: "c1",
        onEnterSubmit: () => undefined,
        errors: over.errors ?? {},
        group: mustGroup("youth-7-10"),
      })
    );
  const field = (html: string) => /<input[^>]*id="enroll-holder-name"[^>]*>/.exec(html)?.[0] ?? "";

  check("ticked: step 2 asks the holder's own name, a labelled text field", () => {
    const html = step({ guardianOnce: true, other: true });
    return (
      field(html).includes('type="text"') &&
      html.includes(`<label for="enroll-holder-name"`) &&
      words(html).includes(HOLDER_NAME_LABEL) &&
      HOLDER_NAME_LABEL === "Your full name"
    );
  });
  check("…with a hint that says whose name it is, tied to the field", () => {
    const html = step({ guardianOnce: true, other: true });
    return (
      words(html).includes(HOLDER_NAME_HINT) &&
      HOLDER_NAME_HINT === "The account goes in your name. The parent or guardian stays as named below." &&
      /aria-describedby="[^"]*enroll-holder-name[^"]*"/.test(field(html))
    );
  });
  check("…first in the Account holder block, above Email, inside that fieldset and its legend", () => {
    const html = step({ guardianOnce: true, other: true });
    const block = /<fieldset><legend[^>]*>Account holder<\/legend>[\s\S]*?<\/fieldset>/.exec(html)?.[0] ?? "";
    return (
      block.includes('id="enroll-holder-name"') &&
      block.indexOf('id="enroll-holder-name"') < block.indexOf('id="enroll-email"') &&
      block.indexOf('id="enroll-email"') < block.indexOf('id="enroll-phone"') &&
      (html.match(/id="enroll-holder-name"/g) ?? []).length === 1 &&
      html.indexOf('id="enroll-holder-name"') < html.indexOf('id="enroll-guardian-name"')
    );
  });
  check("…and signed in, above the line that names the account's email", () => {
    const html = renderToStaticMarkup(
      createElement(RegistrantStep, {
        form: { ...form, guardianIsOther: true },
        setForm: () => undefined,
        players,
        setPlayers: () => undefined,
        isMinor: true,
        guardianOnce: true,
        signedIn: true,
        accountEmail: "holder@example.com",
        cohortId: "c1",
        onEnterSubmit: () => undefined,
        errors: {},
        group: mustGroup("youth-7-10"),
      })
    );
    return html.includes('id="enroll-holder-name"') && html.indexOf('id="enroll-holder-name"') < html.indexOf("Enrolling on your account");
  });
  check("…and the guardian's own name, email and phone are still asked", () => {
    const html = step({ guardianOnce: true, other: true });
    return ["enroll-guardian-name", "enroll-guardian-email", "enroll-guardian-phone"].every((id) => html.includes(`id="${id}"`));
  });
  check("left empty, its error shows the house way: by the field, announced, in the house words", () => {
    const html = step({ guardianOnce: true, other: true, errors: { "enroll-holder-name": FIELD_MESSAGES.nameMissing } });
    return (
      field(html).includes('aria-invalid="true"') &&
      words(html).includes("Add your full name.") &&
      /id="enroll-holder-name-error"/.test(html)
    );
  });
  check("the step checks it, in screen order, with the house message", () =>
    /if \(asksHolderName\(\{ askOnce: youthGroup, isMinor, other: form\.guardianIsOther \}\)\) \{\s*const hn = requiredError\(form\.holderName\);\s*if \(hn\) out\.push\(\{ id: FIELD_IDS\.holderName, message: hn \}\);/.test(wizard) &&
    wizard.indexOf("out.push({ id: FIELD_IDS.holderName") < wizard.indexOf("out.push({ id: FIELD_IDS.email") &&
    wizard.indexOf("out.push({ id: FIELD_IDS.holderName") > wizard.indexOf("out.push({ id, message: outside });") &&
    wizard.includes('holderName: "enroll-holder-name",')
  );
  check("without the tick: no such field, and the step is as it was", () => {
    const html = step({ guardianOnce: true });
    return !html.includes("enroll-holder-name") && !words(html).includes(HOLDER_NAME_LABEL);
  });
  check("an adult group never asks it, with a player under 18 or without", () =>
    !step({ guardianOnce: false, other: true }).includes("enroll-holder-name") &&
    !step({ guardianOnce: false, other: true, isMinor: false }).includes("enroll-holder-name") &&
    !asksHolderName({ askOnce: false, isMinor: true, other: true }) &&
    !asksHolderName({ askOnce: true, isMinor: false, other: true }) &&
    !asksHolderName({ askOnce: true, isMinor: true, other: false }) &&
    asksHolderName({ askOnce: true, isMinor: true, other: true })
  );

  const typed = { holderName: " Sam Okafor ", guardianName: "Dana Chen", firstPlayerName: "Maya Chen" };
  check("posted: ticked on a youth group, accountName is the holder's own name", () =>
    postedHolderName({ askOnce: true, isMinor: true, other: true, ...typed }) === "Sam Okafor"
  );
  check("posted: without the tick, the guardian's, as before", () =>
    postedHolderName({ askOnce: true, isMinor: true, other: false, ...typed }) === "Dana Chen"
  );
  check("posted: an adult group is unchanged, the guardian's for a minor, else the player's", () =>
    postedHolderName({ askOnce: false, isMinor: true, other: true, ...typed }) === "Dana Chen" &&
    postedHolderName({ askOnce: false, isMinor: false, other: false, ...typed }) === "Maya Chen"
  );
  check("the page posts it as accountName, and every other field it posted is still there", () =>
    /const holderName = postedHolderName\(\{\s*askOnce: youthGroup,\s*isMinor,\s*other: form\.guardianIsOther,\s*holderName: form\.holderName,\s*guardianName: form\.guardianName,/.test(wizard) &&
    wizard.includes("accountName: holderName,") &&
    wizard.includes('guardianName: isMinor ? form.guardianName : "",') &&
    wizard.includes('guardianEmail: isMinor ? guardian.email : "",') &&
    wizard.includes('guardianPhone: isMinor ? guardian.phone : "",') &&
    wizard.includes("participantName: players[0]?.name ?? form.participantName,") &&
    wizard.includes("consentSignedName: form.consentSignedName,")
  );

  check("the route names the account after the holder, before the guardian", () =>
    enrollHolderName({ accountName: "Sam Okafor", guardianName: "Dana Chen", participantName: "Maya Chen" }) === "Sam Okafor"
  );
  check("a request without accountName falls back as before: the guardian, then the player", () =>
    enrollHolderName({ guardianName: "Dana Chen", participantName: "Maya Chen" }) === "Dana Chen" &&
    enrollHolderName({ accountName: "", guardianName: " Dana Chen ", participantName: "Maya Chen" }) === "Dana Chen" &&
    enrollHolderName({ guardianName: "", participantName: "Maya Chen" }) === "Maya Chen" &&
    enrollHolderName({}) === ""
  );
  check("a name that is not text names nobody", () =>
    enrollHolderName({ accountName: { a: 1 }, guardianName: 7, participantName: "Maya Chen" }) === "Maya Chen"
  );
  check("the enroll route reads the holder through that rule, for the row, the account and the guest", () =>
    enrollRoute.includes("const holderName = enrollHolderName(body);") &&
    !enrollRoute.includes("body.guardianName || body.accountName") &&
    enrollRoute.includes("accountName: who?.accountName ?? holderName,") &&
    enrollRoute.includes("settleGuestSubmission({ email: holderEmail, holderName, holderPhone, players })")
  );
  check("the guardian stays the guardian: the row's guardian columns still read the guardian's own fields", () =>
    enrollRoute.includes("guardianName: body.guardianName,") &&
    enrollRoute.includes("guardianEmail: body.guardianEmail,") &&
    enrollRoute.includes("guardianPhone: body.guardianPhone,")
  );
}

// ── 3. The e-transfer paid check, per player ────────────────────────────────
console.log("3. E-transfer: only what is still due; every player paid says so, with no inbox line");
{
  const paid = { alreadyPaid: true, amountCents: 20000, creditCents: 0 };
  const owes = { alreadyPaid: false, amountCents: 20000, creditCents: 0 };
  const owesWithCredit = { alreadyPaid: false, amountCents: 18000, creditCents: 2000 };

  check("one of two players already paid: only the other's amount is due", () => {
    const t = etransferTally([paid, owes]);
    return !t.alreadyPaid && t.dueCents === 20000 && t.dueCreditCents === 0 && t.paidPlayers.join() === "true,false";
  });
  check("…in either order, and a paid player's credit is not counted in what is due", () => {
    const t = etransferTally([owesWithCredit, { ...paid, creditCents: 2000 }]);
    return !t.alreadyPaid && t.dueCents === 18000 && t.dueCreditCents === 2000 && t.paidPlayers.join() === "false,true";
  });
  check("every player already paid: nothing is due", () => {
    const t = etransferTally([paid, paid]);
    return t.alreadyPaid && t.dueCents === 0 && t.dueCreditCents === 0;
  });
  check("one player, not paid: as before", () => {
    const t = etransferTally([owesWithCredit]);
    return !t.alreadyPaid && t.dueCents === 18000 && t.dueCreditCents === 2000 && t.paidPlayers.join() === "false";
  });
  check("one player, already paid: every player is paid", () => etransferTally([paid]).alreadyPaid);
  check("a paid player is named only when the paid seat names them", () => {
    const t = etransferTally([{ ...paid, paidNamesPlayer: true }, paid, { ...owes, paidNamesPlayer: true }]);
    return t.paidNamed.join() === "true,false,false" && t.paidPlayers.join() === "true,true,false";
  });
  check("nobody on the transfer is not 'already paid'", () => !etransferTally([]).alreadyPaid);

  check("the route answers from each player's own outcome, and still says alreadyPaid for all of them", () =>
    etransferRoute.includes("const tally = etransferTally(outcomes);") &&
    etransferRoute.includes("const alreadyPaid = tally.alreadyPaid;") &&
    /outcomes\.push\(\{\s*alreadyPaid: result\.alreadyPaid,\s*amountCents: result\.amountCents,\s*creditCents: result\.creditCents,\s*paidNamesPlayer: result\.paidNamesPlayer,\s*\}\);/.test(etransferRoute) &&
    etransferRoute.includes("paidPlayers: tally.paidPlayers,") &&
    etransferRoute.includes("paidNamed: tally.paidNamed,") &&
    etransferRoute.includes("dueCents: tally.dueCents,") &&
    etransferRoute.includes("dueCreditCents: tally.dueCreditCents,") &&
    !etransferRoute.includes("let alreadyPaid = true;")
  );
  check("…and what it did before is untouched: the same rows saved, emails sent and Sheet rows moved", () =>
    etransferRoute.includes("if (!result.alreadyPaid) {\n        const enrollmentId = await saveEnrollmentToSupabase({") &&
    etransferRoute.includes("if (!alreadyPaid) {\n      // Flips every pending row") &&
    etransferRoute.includes("amountCents += result.amountCents;") &&
    etransferRoute.includes("      alreadyPaid,\n      amountCents,\n      creditCents,")
  );

  check("the account email goes with the first player who is not yet paid, once, whoever is first on the request", () => {
    const at = etransferRoute.indexOf("if (!accountNoticeSent) {\n          accountNoticeSent = true;");
    return (
      at > etransferRoute.indexOf("if (!result.alreadyPaid) {\n        const enrollmentId = await saveEnrollmentToSupabase({") &&
      at < etransferRoute.indexOf("notifyEnrollmentAccount(notice)") &&
      etransferRoute.includes("let accountNoticeSent = false;") &&
      !etransferRoute.includes("if (i === 0) {\n") &&
      (etransferRoute.match(/notifyEnrollmentAccount\(/g) ?? []).length === 1
    );
  });
  check("…so the page's \"Check your email\" step is true whenever a player still owes, and absent when none does", () => {
    const owing = enrollConfirmation({ viaEtransfer: true, testPayment: false, signedIn: false, firstName: null });
    const none = enrollConfirmation({ viaEtransfer: true, testPayment: false, signedIn: false, firstName: null, allPaid: true });
    return owing.nextSteps.some((t) => t.startsWith("Check your email")) && !none.nextSteps.some((t) => /check your email/i.test(t));
  });

  // Signed out, the paid check is by player.
  const seats = [
    { id: "new", status: "invited", payment_note: "Leo Chen" },
    { id: "paid-maya", status: "paid", payment_note: "Maya Chen" },
    { id: "old", status: "invited", payment_note: null },
  ];
  const paidOnly = [{ id: "paid-maya", status: "paid", payment_note: "Maya Chen" }];
  check("a paid seat names a player by the same name, ignoring case and extra spaces", () =>
    paidSeatNamesPlayer("Maya Chen", "  maya   CHEN ") &&
    !paidSeatNamesPlayer("Maya Chen", "Leo Chen") &&
    !paidSeatNamesPlayer("Maya Chen", "Maya") &&
    !paidSeatNamesPlayer(null, "Maya Chen") &&
    !paidSeatNamesPlayer("", "") &&
    !paidSeatNamesPlayer("received Jan 3", "Maya Chen")
  );
  check("signed out, a different child alone: never the paid seat, so a row of their own and an amount due", () =>
    guestSeatForPlayer(paidOnly, "Leo Chen") === null &&
    etransferTally([{ alreadyPaid: false, amountCents: 20000, creditCents: 0, paidNamesPlayer: false }]).dueCents === 20000 &&
    !etransferTally([{ alreadyPaid: false, amountCents: 20000, creditCents: 0 }]).alreadyPaid
  );
  check("…or the seat of theirs still waiting on payment, never the sibling's paid one", () =>
    guestSeatForPlayer(seats, "Leo Chen")?.id === "new" && guestSeatForPlayer(seats, "Ana Chen")?.id === "new"
  );
  check("signed out, the same child again: the paid seat that names them, so already paid", () =>
    guestSeatForPlayer(paidOnly, "maya chen")?.id === "paid-maya" && guestSeatForPlayer(seats, "Maya  Chen")?.id === "paid-maya"
  );
  check("a paid seat with no name, or the coach's words in its place, is nobody's: the player owes", () =>
    guestSeatForPlayer([{ id: "x", status: "paid", payment_note: null }], "Maya Chen") === null &&
    guestSeatForPlayer([{ id: "x", status: "paid", payment_note: "received Jan 3" }], "Maya Chen") === null &&
    guestSeatForPlayer([], "Maya Chen") === null
  );
  check("two players, one matched by name: only that one is paid", () => {
    // What the recorder answers for each: Maya lands on her paid seat, Leo on none.
    const maya = guestSeatForPlayer(paidOnly, "Maya Chen");
    const leo = guestSeatForPlayer(paidOnly, "Leo Chen");
    const t = etransferTally([
      { alreadyPaid: maya?.status === "paid", amountCents: 20000, creditCents: 0, paidNamesPlayer: true },
      { alreadyPaid: leo?.status === "paid", amountCents: 20000, creditCents: 0, paidNamesPlayer: false },
    ]);
    return t.paidPlayers.join() === "true,false" && t.paidNamed.join() === "true,false" && t.dueCents === 20000 && !t.alreadyPaid;
  });
  check("the recorder matches a signed-out player's seat through that rule, and only signed out", () => {
    const at = actions.indexOf("invite = guestSeatForPlayer((data as InviteRef[] | null) ?? [], params.participantName);");
    const block = actions.slice(actions.indexOf('if (!invite && plan.includes("email")) {'), actions.indexOf('if (!invite && plan.includes("reuse")) {'));
    return (
      at > 0 &&
      block.includes("if (!accountId) {") &&
      block.includes('.is("user_id", null)') &&
      block.includes('.is("participant_id", null)') &&
      // Signed in: the newest seat for the email, as before.
      /\} else \{\s*const \{ data \} = await q\s*\.order\("invited_at", \{ ascending: false \}\)\s*\.limit\(1\)\s*\.maybeSingle\(\);\s*invite = \(data as InviteRef \| null\) \?\? null;/.test(block)
    );
  });
  check("the recorder says whether the paid seat names the player: their id on the account, or their name", () =>
    /const paidNamesPlayer =\s*\(Boolean\(params\.participantId\) && invite\.participant_id === params\.participantId\) \|\|\s*paidSeatNamesPlayer\(invite\.payment_note, params\.participantName\);/.test(actions) &&
    actions.includes("return { ok: true, ...settled, alreadyPaid: true, paidNamesPlayer };") &&
    actions.includes("return { ok: true, ...settled, alreadyPaid: false, paidNamesPlayer: false };")
  );

  // The step reads the answer strictly.
  check("the step reads who is paid only from an answer shaped for its own players", () => {
    const s = settledFromAnswer({ alreadyPaid: false, paidPlayers: [true, false], paidNamed: [true, false], dueCents: 18000, dueCreditCents: 2000 }, 2);
    return s?.paid.join() === "true,false" && s.named.join() === "true,false" && s.dueCents === 18000 && s.dueCreditCents === 2000;
  });
  check("nobody paid, an older answer, a wrong count or a bad shape: the step keeps its details, as before", () =>
    settledFromAnswer({ alreadyPaid: false, paidPlayers: [false, false] }, 2) === null &&
    settledFromAnswer({ alreadyPaid: false }, 2) === null &&
    settledFromAnswer({ paidPlayers: [true], dueCents: 20000 }, 2) === null &&
    // A player still owes but the answer carries no amount: not read at all.
    settledFromAnswer({ paidPlayers: [true, false] }, 2) === null &&
    settledFromAnswer({ paidPlayers: [true, false], dueCents: "20000" }, 2) === null &&
    settledFromAnswer({ paidPlayers: [true, false], dueCents: -1 }, 2) === null &&
    settledFromAnswer({ paidPlayers: ["true", false] }, 2) === null &&
    settledFromAnswer(null, 2) === null &&
    settledFromAnswer("x", 1) === null
  );
  check("an answer that only says every player is paid counts for all of them", () =>
    settledFromAnswer({ alreadyPaid: true }, 2)?.paid.join() === "true,true" &&
    settledFromAnswer({ alreadyPaid: true }, 2)?.dueCents === 0 &&
    settledFromAnswer({ alreadyPaid: true }, 2)?.named.join() === "false,false"
  );
  check("a player is named only where the answer says the paid seat names them", () =>
    settledFromAnswer({ paidPlayers: [true, false], dueCents: 20000 }, 2)?.named.join() === "false,false" &&
    settledFromAnswer({ paidPlayers: [true, false], paidNamed: [true, true], dueCents: 20000 }, 2)?.named.join() === "true,false" &&
    settledFromAnswer({ paidPlayers: [true, false], paidNamed: ["yes"], dueCents: 20000 }, 2)?.named.join() === "false,false"
  );
  check("a credit that is not a positive number is no credit", () =>
    settledFromAnswer({ paidPlayers: [true, false], dueCents: 20000, dueCreditCents: "2000" }, 2)?.dueCreditCents === 0 &&
    settledFromAnswer({ paidPlayers: [true, false], dueCents: 20000, dueCreditCents: -5 }, 2)?.dueCreditCents === 0
  );

  const cohort = { priceCents: 20000, label: "Winter A" };
  const names = ["Maya Chen", "Leo Chen"];
  const before = etransferStepDetails({ cohort, seats: 2, creditCents: 0, recipientEmail: "pay@example.com", memo: "Maya Chen + Leo Chen – Winter A" });
  const partial = etransferDetailsStillDue({
    cohort,
    playerNames: names,
    settled: { paid: [true, false], named: [true, false], dueCents: 20000, dueCreditCents: 0 },
    recipientEmail: "pay@example.com",
  });
  check("(the premise) before the answer the step shows both players' total", () => before.amount === "$400 CAD");
  check("one of two paid: the amount is the other player's alone, never the full total", () =>
    partial?.amount === "$200 CAD" && partial.amount !== before.amount
  );
  check("…the line under it says whose seat is already paid for, never that the player was paid", () =>
    partial?.breakdown === "Already paid for Maya Chen." &&
    alreadyPaidNote(["Maya Chen", "Leo Chen"]) === "Already paid for Maya Chen and Leo Chen." &&
    alreadyPaidNote(["Maya Chen", "Leo Chen", "Ana Chen"]) === "Already paid for Maya Chen, Leo Chen and Ana Chen." &&
    alreadyPaidNote([]) === null &&
    !/\} (is|are) already paid/.test(wizard)
  );
  check("a paid player no paid seat names is counted, never named, in the same shape", () => {
    const d = etransferDetailsStillDue({
      cohort,
      playerNames: names,
      settled: { paid: [true, false], named: [false, false], dueCents: 20000, dueCreditCents: 0 },
      recipientEmail: "pay@example.com",
    });
    return (
      d?.breakdown === "Already paid for one player." &&
      !d.breakdown.includes("Maya") &&
      alreadyPaidNote([], 2) === "Already paid for 2 players." &&
      alreadyPaidNote(["Maya Chen"], 1) === "Already paid for Maya Chen and one other player."
    );
  });
  check("…and the message names only the player who still owes", () =>
    partial?.memo === "Leo Chen – Winter A" && partial.recipientEmail === "pay@example.com"
  );
  check("one of three paid, with a credit left in what is due: the working, then who is paid", () => {
    const d = etransferDetailsStillDue({
      cohort,
      playerNames: ["Maya Chen", "Leo Chen", "Ana Chen"],
      settled: { paid: [false, true, false], named: [false, true, false], dueCents: 38000, dueCreditCents: 2000 },
      recipientEmail: "pay@example.com",
    });
    return (
      d?.amount === "$380 CAD" &&
      d.breakdown === "$200 × 2 players − $20 assessment credit. Already paid for Leo Chen." &&
      d.memo === "Maya Chen + Ana Chen – Winter A"
    );
  });
  check("the amount shown is the route's own figure, from its answer to the page", () => {
    const t = etransferTally([{ ...owesWithCredit }, paid, owes]);
    const answer = JSON.parse(JSON.stringify({ ok: true, ...t }));
    const settled = settledFromAnswer(answer, 3);
    const d = settled && etransferDetailsStillDue({ cohort, playerNames: ["Maya Chen", "Leo Chen", "Ana Chen"], settled, recipientEmail: "pay@example.com" });
    return settled?.dueCents === t.dueCents && d?.amount === `$${t.dueCents / 100} CAD`;
  });
  check("…shown as it stands, even where the page's own arithmetic would differ", () => {
    const d = etransferDetailsStillDue({
      cohort,
      playerNames: names,
      // A figure no price times players gives: the page shows it untouched.
      settled: { paid: [true, false], named: [true, false], dueCents: 12345, dueCreditCents: 0 },
      recipientEmail: "pay@example.com",
    });
    return d?.amount === "$123.45 CAD";
  });
  check("the wizard hands the step the route's figure and never works the amount out again", () => {
    const fn = /export function etransferDetailsStillDue[\s\S]*?\n}\n/.exec(wizard)?.[0] ?? "";
    return fn.includes("dueCents: settled.dueCents,") && !fn.includes("amountDueCents(") && wizard.includes("amount: `${moneyCAD(input.dueCents ?? due)} CAD`,");
  });
  check("every player paid: no details at all, so nothing can be shown or carried", () =>
    etransferDetailsStillDue({ cohort, playerNames: names, settled: { paid: [true, true], named: [true, true], dueCents: 0, dueCreditCents: 0 }, recipientEmail: "pay@example.com" }) === null
  );
  check("one player, not paid: the step's details are word for word what they were", () => {
    const d = etransferStepDetails({ cohort, seats: 1, creditCents: 2000, recipientEmail: "pay@example.com", memo: "Maya Chen – Winter A" });
    return (
      JSON.stringify(d) ===
      JSON.stringify({ amount: "$180 CAD", breakdown: "$200 − $20 assessment credit", recipientEmail: "pay@example.com", memo: "Maya Chen – Winter A" }) &&
      etransferStepDetails({ cohort, seats: 1, creditCents: 0, recipientEmail: "a@example.com", memo: "m" }).breakdown === null &&
      before.breakdown === "$200 × 2 players"
    );
  });

  const stepHtml = (details: Parameters<typeof EtransferStep>[0]["details"]) =>
    renderToStaticMarkup(createElement(EtransferStep, { details, cardOffer: false, submitting: false, onPayByCard: () => undefined }));
  check("the step, one of two paid: the amount still due, who is paid, and no full total", () => {
    const w = words(stepHtml(partial));
    return w.includes("Amount $200 CAD Already paid for Maya Chen.") && !w.includes("$400") && w.includes("Message Leo Chen – Winter A");
  });
  check("the step, every player paid: it says so, with no amount, address, message or word of an email", () => {
    const w = words(stepHtml(null));
    return w === ETRANSFER_ALL_PAID_LINE && !/\$|Send to|Message|email|inbox/i.test(w);
  });

  const send = /async function sendEtransfer\(\) \{[\s\S]*?\n  \}\n/.exec(wizard)?.[0] ?? "";
  check("the wizard reads the answer per player, and the step follows it while it is on screen", () =>
    send.includes("const answered = settledFromAnswer(sent, players.length);") &&
    send.includes("const due = allPaid ? null : answered ? detailsAfter(answered) : etransferDetails;") &&
    send.includes("if (answered) setSettled(answered);") &&
    wizard.includes("const stepDetails = settled ? detailsAfter(settled) : etransferDetails;") &&
    wizard.includes("<EtransferStep\n              details={stepDetails}")
  );
  check("what it leaves for the page after is what is still due, and nothing when every player is paid", () =>
    send.includes("if (due && shouldSaveEtransferDetails({ signedIn: household.signedIn, alreadyPaid: allPaid })) {") &&
    send.includes("saveEtransferDetails(tabStorage(), cohort.id, due);") &&
    !send.includes("saveEtransferDetails(tabStorage(), cohort.id, etransferDetails);") &&
    !shouldSaveEtransferDetails({ signedIn: false, alreadyPaid: true }) &&
    shouldSaveEtransferDetails({ signedIn: false, alreadyPaid: false })
  );
  check("every player paid: the address after carries a flag, never a name or an amount", () =>
    send.includes('if (allPaid) params.set("paid", "1");') &&
    !/params\.set\([^)]*(memo|amount|recipient|name|email)/i.test(send)
  );

  // The page after.
  const conf = (over: Partial<Parameters<typeof enrollConfirmation>[0]>) =>
    enrollConfirmation({ viaEtransfer: true, testPayment: false, signedIn: false, firstName: null, ...over });
  const everyWord = (c: ReturnType<typeof conf>) =>
    [c.badge, c.heading, c.lead, c.inboxLine ?? "", c.firstStepOnPage ?? "", ...c.nextSteps].join(" ");

  check("every player paid, signed out: the page says so", () => {
    const c = conf({ allPaid: true });
    return (
      c.badge === ETRANSFER_ALL_PAID_BADGE &&
      c.heading === ETRANSFER_ALL_PAID_HEADING &&
      c.lead === `${ETRANSFER_ALL_PAID_LINE} ${ETRANSFER_ALL_PAID_NO_EMAIL}` &&
      ETRANSFER_ALL_PAID_HEADING === "This enrollment is already paid." &&
      ETRANSFER_ALL_PAID_LINE === "We already have the payment for every player you enrolled here, so there is nothing to send." &&
      ETRANSFER_ALL_PAID_NO_EMAIL === "We haven't sent a new email."
    );
  });
  check("…with no inbox line and no step that sends anyone to an email that never went", () => {
    const c = conf({ allPaid: true });
    return (
      c.inboxLine === null &&
      c.firstStepOnPage === null &&
      !/inbox|in your email|check your email|send the e-transfer|spot is held/i.test(everyWord(c)) &&
      c.nextSteps.join("|") === ETRANSFER_ALL_PAID_NEXT
    );
  });
  check("…and the two ways back in stay, since a guest still has no password", () =>
    conf({ allPaid: true }).links.map((l) => l.href).join() === "/login,/auth/forgot-password"
  );
  check("every player paid, signed in: the same, with the dashboard step and no inbox sentence", () => {
    const c = conf({ allPaid: true, signedIn: true });
    return (
      c.heading === ETRANSFER_ALL_PAID_HEADING &&
      !/inbox|in your email/i.test(everyWord(c)) &&
      c.nextSteps.length === 2 &&
      c.nextSteps[0].startsWith("This enrollment is on your dashboard") &&
      c.links.length === 0
    );
  });
  check("not every player paid: the page's words are what they were, signed out and signed in", () => {
    const base = enrollConfirmation({ viaEtransfer: true, testPayment: false, signedIn: false, firstName: null });
    const signedIn = enrollConfirmation({ viaEtransfer: true, testPayment: false, signedIn: true, firstName: "Maya" });
    return (
      JSON.stringify(conf({ allPaid: false })) === JSON.stringify(base) &&
      base.heading === "Your spot is held." &&
      base.badge === "Spot Held" &&
      base.inboxLine !== null &&
      JSON.stringify(conf({ allPaid: false, signedIn: true, firstName: "Maya" })) === JSON.stringify(signedIn) &&
      signedIn.heading === "Maya, your spot is held."
    );
  });
  check("the flag means nothing after a card payment", () =>
    JSON.stringify(enrollConfirmation({ viaEtransfer: false, testPayment: false, signedIn: false, firstName: null, allPaid: true })) ===
      JSON.stringify(enrollConfirmation({ viaEtransfer: false, testPayment: false, signedIn: false, firstName: null })) &&
    enrollConfirmation({ viaEtransfer: false, testPayment: true, signedIn: false, firstName: null, allPaid: true }).heading === "This was a test payment."
  );
  check("the page reads the flag only after an e-transfer, and for its words alone", () =>
    confirmedPage.includes('const allPaid = viaEtransfer && sp.paid === "1";') &&
    (confirmedPage.match(/allPaid/g) ?? []).length === 3 &&
    confirmedPage.includes("    firstName,\n    allPaid,\n  });") &&
    confirmedPage.includes("{copy.inboxLine && <EtransferDetailsFromStep cohortId={cohortId} inboxLine={copy.inboxLine} />}")
  );
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll sign-up server-fixes checks passed.");
