// Run from project root: npx tsx src/scripts/test-error-screens-and-lessons.ts
//
// Pins backlog #103:
//   1. The error screen's "Try again" asks the server again, then redraws:
//      router.refresh() and reset() in one startTransition. reset() alone
//      redraws the page from what the browser already holds, so a server read
//      that failed stayed failed until a reload. Its words are unchanged.
//   2. The whole-site error screen (global-error.tsx replaces the root
//      layout, so it has no header or footer) reloads the page, says so on
//      its button, and ends with the sentence the error screen ends with, the
//      address a mailto link.
//   3. "Ask about lessons", on the Private Lessons page and on its row on
//      /programs, opens an email to info@tennisbootcamp.ca with the subject
//      "Private lessons", the address written next to it, and never the quiz.
//      Each keeps its look and its click event, renamed from quiz_cta_click
//      to lessons_cta_click. Fix round: the page's outline "Email
//      info@tennisbootcamp.ca" carries the same subject, and no Private
//      Lessons string mentions the quiz; its words offer the email.
//
// The repo has no DOM test runner: the screens are rendered to static markup,
// and a button's click handler is read off the elements its component
// returns, then called with stand-ins (the router, window.location, the GA
// data layer). The Private Lessons page renders through a stand-in database
// client (stub-cohort-reads.ts). Every check catches its own error, so each
// reports on its own. Exits non-zero on any failure.

// First: the program page imports server-only modules, and reads Supabase through the stand-in.
import "./stub-server-only";
import { setCohortRows } from "./stub-cohort-reads";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import ErrorScreen from "../app/error";
import GlobalError from "../app/global-error";
import ProgramDetailPage from "../app/programs/[slug]/page";
import { groupById, listedPrograms, programGroups } from "../content/programs";
import { groupCards } from "../lib/groupBlocks";
import { EMPTY_QUERY, parseCatalogQuery } from "../lib/programFilters";
import { ArrangedGroupRow } from "../components/sections/ProgramGroupCard";
import { ProgramCatalogView, type CatalogProgram } from "../components/sections/ProgramCatalog";
import { TrackedButton, TrackedLink } from "../components/ui/TrackedButton";

let failed = 0;
function check(name: string, test: () => boolean, detail?: () => string) {
  let ok = false;
  let why = "";
  try {
    ok = test();
    if (!ok && detail) why = detail();
  } catch (err) {
    why = `threw: ${err instanceof Error ? err.message : String(err)}`;
  }
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${why ? ` — ${why}` : ""}`);
  }
}

const ROOT = process.cwd();
/** A source file, its line endings normalised. */
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");
const render = (el: ReactElement) => renderToStaticMarkup(el);
const unescape = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
/** The words a piece of markup shows, in order (no space is read before a comma or a full stop). */
const words = (html: string) =>
  unescape(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/ ([,.])/g, "$1")
    .trim();
/** The last sentence of a line of text. */
const lastSentence = (text: string) => text.split(/(?<=\.)\s+/).pop() ?? "";

/** The email "Ask about lessons" opens: to us, with the subject filled in, encoded. */
const LESSONS_MAILTO = "mailto:info@tennisbootcamp.ca?subject=Private%20lessons";
const ADDRESS = "info@tennisbootcamp.ca";

type Anchor = { href: string; className: string; text: string; html: string };

/** Every link in a piece of markup: its href, its class, its words and its markup. */
function anchors(html: string): Anchor[] {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([whole, attrs, inner]) => ({
    href: unescape(/\bhref="([^"]*)"/.exec(attrs)?.[1] ?? ""),
    className: /\bclass="([^"]*)"/.exec(attrs)?.[1] ?? "",
    text: words(inner),
    html: whole,
  }));
}

/** The links that read "Ask about lessons". */
const askLinks = (html: string) => anchors(html).filter((a) => a.text === "Ask about lessons");

/** The first words after a piece of markup, or "" when it is not there. */
function wordsAfter(html: string, piece: string | undefined, length = 60): string {
  const at = piece ? html.indexOf(piece) : -1;
  return at === -1 ? "" : words(html.slice(at + (piece ?? "").length)).slice(0, length);
}

// ─── Elements and their click handlers ──────────────────────────────────────

type Element = ReactElement<{ children?: ReactNode } & Record<string, unknown>>;

/** Every element in a tree, depth first, through children only. */
function elementsIn(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap((child: ReactNode) => elementsIn(child));
  if (!isValidElement(node)) return [];
  const el = node as Element;
  return [el, ...elementsIn(el.props.children)];
}

/**
 * What a component returns, event handlers included (a static render drops
 * them). It is called inside a render, so its hooks work, inside `around` (a
 * context provider) when it needs one.
 */
function returnedBy<P>(component: (props: P) => ReactNode, props: P, around?: (child: ReactElement) => ReactElement): ReactNode {
  const box: { out: ReactNode } = { out: null };
  const probe = () => {
    box.out = component(props);
    return null;
  };
  const el = createElement(probe);
  render(around ? around(el) : el);
  return box.out;
}

/** A stand-in app router that writes down what it is asked to do. */
function standInRouter(calls: string[]): AppRouterInstance {
  return {
    back: () => calls.push("back"),
    forward: () => calls.push("forward"),
    refresh: () => calls.push("refresh"),
    push: () => calls.push("push"),
    replace: () => calls.push("replace"),
    prefetch: () => calls.push("prefetch"),
  };
}

/** Runs `fn` with a stand-in `window` and `document`, then puts back what was there. */
function withBrowser<T>(window: unknown, document: unknown, fn: () => T): T {
  const g = globalThis as Record<string, unknown>;
  const had = { window: "window" in g, document: "document" in g };
  const saved = { window: g.window, document: g.document };
  g.window = window;
  g.document = document;
  try {
    return fn();
  } finally {
    if (had.window) g.window = saved.window;
    else delete g.window;
    if (had.document) g.document = saved.document;
    else delete g.document;
  }
}

/** The GA events a click sends ("name {params}"), through a stand-in browser and GA id. */
function eventsSentBy(click: () => void): string[] {
  const dataLayer: unknown[] = [];
  const savedId = process.env.NEXT_PUBLIC_GA_ID;
  process.env.NEXT_PUBLIC_GA_ID = "G-STANDIN";
  try {
    withBrowser({ dataLayer, location: { href: "https://tennisbootcamp.ca/programs" } }, { referrer: "" }, click);
  } finally {
    if (savedId === undefined) delete process.env.NEXT_PUBLIC_GA_ID;
    else process.env.NEXT_PUBLIC_GA_ID = savedId;
  }
  return dataLayer
    .map((entry) => Array.from(entry as ArrayLike<unknown>))
    .filter((args) => args[0] === "event")
    .map((args) => `${String(args[1])} ${JSON.stringify(args[2])}`);
}

/** Calls an element's onClick with a stand-in event. */
const click = (el: Element | undefined) => (el?.props.onClick as (e: unknown) => void)({});

async function main() {
  // ── 1. The error screen (error.tsx) ───────────────────────────────────────
  console.log("The error screen: Try again asks the server again (error.tsx)");
  const errorCalls: string[] = [];
  const errorProps = { error: new Error("a server read timed out"), reset: () => void errorCalls.push("reset") };
  const inRouter = (child: ReactElement) => createElement(AppRouterContext.Provider, { value: standInRouter(errorCalls) }, child);
  check(
    "Try again refreshes the page's server data, then resets: router.refresh() once, then reset() once",
    () => {
      const tree = returnedBy(ErrorScreen, errorProps, inRouter);
      click(elementsIn(tree).find((el) => el.type === "button"));
      return errorCalls.join(",") === "refresh,reset";
    },
    () => `called: ${errorCalls.join(",") || "nothing"}`
  );
  const errorSrc = read("src/app/error.tsx");
  check(
    "both calls run in one startTransition, refresh first (the documented pattern), and the button no longer calls reset alone",
    () =>
      /startTransition\(\(\) => \{\s*router\.refresh\(\);\s*reset\(\);\s*\}\);/.test(errorSrc) &&
      errorSrc.includes("const router = useRouter();") &&
      !/onClick=\{reset\}/.test(errorSrc)
  );
  const errorHtml = render(inRouter(createElement(ErrorScreen, errorProps)));
  const errorLine = words(/<p\b[^>]*>(We hit an unexpected error\.[\s\S]*?)<\/p>/.exec(errorHtml)?.[1] ?? "");
  check(
    "its words and look are unchanged: Error, Something went wrong, the sentence ending with info@ as a mailto link, Try again and Back to Home",
    () =>
      words(errorHtml) ===
        "Error Something went wrong We hit an unexpected error. Try again, or head back home. If it keeps happening, email info@tennisbootcamp.ca. Try again Back to Home" &&
      /<a href="mailto:info@tennisbootcamp\.ca" class="text-\[#B4E655\] underline-offset-2 hover:underline">info@tennisbootcamp\.ca<\/a>\./.test(errorHtml) &&
      /<button type="button" class="[^"]*bg-\[#B4E655\][^"]*">Try again<\/button>/.test(errorHtml),
    () => words(errorHtml)
  );

  // ── 2. The whole-site error screen (global-error.tsx) ─────────────────────
  console.log("The whole-site error screen (global-error.tsx)");
  const globalCalls: string[] = [];
  const globalProps = { error: new Error("the root layout failed"), reset: () => void globalCalls.push("reset") };
  check(
    "its button reloads the page, and never only redraws (reset)",
    () => {
      let reloads = 0;
      const tree = returnedBy(GlobalError, globalProps);
      const button = elementsIn(tree).find((el) => el.type === "button");
      withBrowser({ location: { reload: () => void reloads++ } }, {}, () => click(button));
      return reloads === 1 && globalCalls.length === 0;
    },
    () => `reset called ${globalCalls.length} time(s)`
  );
  const globalHtml = render(createElement(GlobalError, globalProps));
  const globalParagraph = /<p\b[^>]*>(We hit an unexpected error\.[\s\S]*?)<\/p>/.exec(globalHtml)?.[1] ?? "";
  check("its label says so: Reload the page", () => /<button\b[^>]*>Reload the page<\/button>/.test(globalHtml) && !globalHtml.includes(">Try again<"), () => words(globalHtml));
  check(
    "its text names that button, then ends with the error screen's info@ sentence, word for word",
    () =>
      words(globalParagraph) ===
        "We hit an unexpected error. Reload the page, or head back home. If it keeps happening, email info@tennisbootcamp.ca." &&
      lastSentence(words(globalParagraph)) === lastSentence(errorLine),
    () => words(globalParagraph)
  );
  check("…the address a mailto link, so a visitor with no header or footer can still reach us", () =>
    /<a href="mailto:info@tennisbootcamp\.ca"[^>]*>info@tennisbootcamp\.ca<\/a>\.$/.test(globalParagraph)
  );
  check(
    "its look is unchanged: the navy page, the lime button, Back to Home",
    () =>
      globalHtml.includes('<body style="margin:0;background:#061427">') &&
      /<button\b[^>]*style="background:#B4E655;color:#061427;[^"]*"/.test(globalHtml) &&
      /<a href="\/" style="[^"]*">Back to Home<\/a>/.test(globalHtml),
    () => globalHtml.slice(0, 200)
  );

  // ── 3. Ask about lessons ──────────────────────────────────────────────────
  console.log("Ask about lessons: an email to us, never the quiz");
  // The Private Lessons page as a visitor sees it, with no open block anywhere.
  setCohortRows([]);
  let pageTree: ReactNode = null;
  let page = "";
  let pageError = "";
  try {
    pageTree = await ProgramDetailPage({ params: Promise.resolve({ slug: "private-lessons" }) });
    page = render(pageTree as ReactElement);
  } catch (err) {
    pageError = `the page threw: ${err instanceof Error ? err.message : String(err)}`;
  }
  const pageAsk = askLinks(page);
  check(
    "on the Private Lessons page, the lime button reads Ask about lessons, once, and opens an email to info@ with the subject Private lessons",
    () => pageAsk.length === 1 && pageAsk[0].href === LESSONS_MAILTO,
    () => pageError || JSON.stringify(pageAsk.map((a) => a.href))
  );
  check("…and never links to /intake", () => pageAsk.length > 0 && pageAsk.every((a) => !a.href.includes("/intake")), () => pageError || JSON.stringify(pageAsk.map((a) => a.href)));
  check(
    "…it keeps its look: the lime, full-width main button, marked for the phone bar",
    () => pageAsk.length === 1 && pageAsk[0].className.includes("bg-[#B4E655]") && pageAsk[0].className.includes("w-full") && pageAsk[0].html.includes("data-main-cta"),
    () => pageError || pageAsk[0]?.html || "no Ask about lessons link"
  );
  check(
    "…with the address written right under it (the outline Email info@tennisbootcamp.ca, which signed-in visitors see too)",
    () => wordsAfter(page, pageAsk[0]?.html).startsWith(`Email ${ADDRESS}`),
    () => pageError || wordsAfter(page, pageAsk[0]?.html)
  );
  // Fix round: the page offers only the email, in its words and on both of
  // its buttons. Its closing (the main action and the quiz side line, below
  // the levels) is the site's own and stays.
  const pageEmail = anchors(page).find((a) => a.text === `Email ${ADDRESS}`);
  check(
    "both buttons carry the subject: Ask about lessons and the outline Email info@tennisbootcamp.ca under it",
    () => pageAsk.length === 1 && pageAsk[0].href === LESSONS_MAILTO && pageEmail?.href === LESSONS_MAILTO,
    () => pageError || `${pageAsk[0]?.href} | ${pageEmail?.href}`
  );
  const pageTop = pageEmail ? page.slice(0, page.indexOf(pageEmail.html) + pageEmail.html.length) : "";
  check(
    "the page, from its title to the panel's last button, never mentions the quiz or links to it",
    () => pageTop.length > 0 && !/quiz/i.test(words(pageTop)) && !pageTop.includes("/intake"),
    () => pageError || words(pageTop).match(/.{0,60}quiz.{0,20}/i)?.[0] || "no Email button found"
  );
  const privateLessons = listedPrograms.find((p) => p.slug === "private-lessons")!;
  const privateWords = [privateLessons, groupById("private-lessons")!].flatMap((entry) =>
    Object.values(entry).filter((v): v is string => typeof v === "string")
  );
  check(
    "no Private Lessons string mentions the quiz: not its search line, its paragraph, its panel line, nor any other word of the program or its group",
    () => privateWords.length > 10 && privateWords.every((w) => !/quiz/i.test(w)),
    () => privateWords.filter((w) => /quiz/i.test(w)).join(" | ")
  );
  check(
    "they offer the email instead: tell us what you want to work on, and we come back with times and a rate",
    () =>
      privateLessons.metaDescription ===
        "Private tennis lessons in Toronto for any age and level. Rates on request. Email us what you want to work on, and we'll come back with times and a rate." &&
      privateLessons.longDescription.endsWith(" Email info@tennisbootcamp.ca and tell us what you want to work on.") &&
      privateLessons.priceLine === "Rates on request. Email us, and we'll come back to you with times and a rate.",
    () => [privateLessons.metaDescription, privateLessons.longDescription, privateLessons.priceLine].join(" | ")
  );
  let pageEvents: string[] = [];
  check(
    "…and its click still sends its event, renamed lessons_cta_click, with its source; never quiz_cta_click",
    () => {
      const button = elementsIn(pageTree).find((el) => el.type === TrackedButton && el.props.children === "Ask about lessons");
      const link = returnedBy(TrackedButton, button?.props as unknown as ComponentProps<typeof TrackedButton>) as Element;
      pageEvents = eventsSentBy(() => click(link));
      return pageEvents.length === 1 && pageEvents[0] === 'lessons_cta_click {"source":"program-detail"}';
    },
    () => pageError || `sent: ${pageEvents.join(" | ") || "nothing"}`
  );

  // The row on /programs.
  const privateGroup = groupById("private-lessons")!;
  const rowProps = { group: privateGroup, source: "programs-group" };
  let row = "";
  let rowError = "";
  try {
    row = render(createElement(ArrangedGroupRow, rowProps));
  } catch (err) {
    rowError = `the row threw: ${err instanceof Error ? err.message : String(err)}`;
  }
  const rowAsk = askLinks(row);
  check(
    "on /programs, the Private Lessons row's Ask about lessons opens that email, never /intake",
    () => anchors(row).length === 1 && rowAsk.length === 1 && rowAsk[0].href === LESSONS_MAILTO,
    () => rowError || JSON.stringify(anchors(row).map((a) => a.href))
  );
  check(
    "…it keeps its look: the outline button, at the cards' button height",
    () => rowAsk.length === 1 && rowAsk[0].className.includes("border-white/25") && rowAsk[0].className.includes("h-[46px]") && !rowAsk[0].className.includes("bg-[#B4E655]"),
    () => rowError || rowAsk[0]?.className || "no Ask about lessons link"
  );
  check(
    "…and the address is written next to it, as text a visitor can copy (the button stays the row's one link)",
    () => wordsAfter(row, rowAsk[0]?.html).startsWith(ADDRESS) && anchors(row).length === 1,
    () => rowError || wordsAfter(row, rowAsk[0]?.html)
  );
  let rowEvents: string[] = [];
  check(
    "…and its click still sends its event, renamed lessons_cta_click, with its source; never quiz_cta_click",
    () => {
      const link = elementsIn(returnedBy(ArrangedGroupRow, rowProps)).find((el) => el.type === TrackedLink);
      const anchor = returnedBy(TrackedLink, link?.props as unknown as ComponentProps<typeof TrackedLink>) as Element;
      rowEvents = eventsSentBy(() => click(anchor));
      return rowEvents.length === 1 && rowEvents[0] === 'lessons_cta_click {"source":"programs-group"}';
    },
    () => rowError || `sent: ${rowEvents.join(" | ") || "nothing"}`
  );
  const catalogPrograms: CatalogProgram[] = listedPrograms.map((p) => ({ slug: p.slug, title: p.title }));
  const catalog = (query: string) =>
    render(
      createElement(ProgramCatalogView, {
        programs: catalogPrograms,
        cards: groupCards(programGroups, []),
        header: createElement("h1", null, "Our Programs"),
        query: query ? parseCatalogQuery(new URLSearchParams(query)) : EMPTY_QUERY,
        onChange: () => {},
      })
    );
  check(
    "wherever the row shows on /programs (every group, by age, by level, beside Closest fit), Ask about lessons is that email with the address next to it, and nothing links the quiz for private lessons",
    () =>
      ["", "age=14", "age=adult&level=advanced", "age=14&level=intermediate"].every((query) => {
        const html = catalog(query);
        const ask = askLinks(html);
        return ask.length === 1 && ask[0].href === LESSONS_MAILTO && wordsAfter(html, ask[0].html).startsWith(ADDRESS) && !html.includes("/intake?program=private-lessons");
      })
  );
  check("/programs hands the row its click source, programs-group", () =>
    read("src/components/sections/ProgramCatalog.tsx").includes('<ArrangedGroupRow group={g} source="programs-group" />')
  );

  if (failed > 0) {
    console.log(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nError screens and Ask about lessons: all checks passed.");
}

void main();
