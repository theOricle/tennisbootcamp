# Task: Apply ops/plans/assessment-restructure-docsync.md (append its blocks to the .claude/memory files, then delete it), then execute Phase 1 of ops/plans/assessment-restructure.md
**ID:** 2026-07-18T22-14-46-apply-ops-plans-assessment-restructure-docsync-m
**Date:** 2026-07-18T22:19:11.888Z

---

## Plan
I have both files. Now I'll apply my planner rules: output **exactly one** safe, conservatively-scoped, immediately-actionable task.

The request bundles two things of very different size and risk. Phase 1 alone is an entire PR — a Supabase migration, three new pages, a Stripe-adjacent API route, an admin surface, two emails, GA events, and seed SQL. That is a multi-step plan, not a single safe task, and it touches the payment layer. The docsync, by contrast, is a small, purely-documentation, non-code operation that is the stated prerequisite ("First Claude Code session… then delete this file") and cannot break the intake pipeline. Smallest safe interpretation → scope the single task to the docsync.

---

## Task Title
Apply assessment-restructure docsync to memory files

## Objective
The three `.claude/memory/` files carry the four 2026-07-18 pivot decisions, five open questions, and session-log entry, and the consumed docsync file is deleted — with no product code touched.

## Scope
Only these files may be touched:
- `.claude/memory/DECISIONS.md` — append the four "2026-07-18" blocks (assessment-first funnel, admin-created private cohorts, attendance & make-up terms, club membership pass-through).
- `.claude/memory/OPEN_QUESTIONS.md` — append the five question blocks under its existing `## Open` heading (club guest provision, winter plan, config confirmations, assessment block schedule).
- `.claude/memory/PROGRESS.md` — append the `### 2026-07-18 (Cowork planning session — product pivot)` entry at the end of the Session Log.
- `ops/plans/assessment-restructure-docsync.md` — delete after the three appends are done.

No other file may be created, edited, moved, or deleted. Do **not** begin Phase 1 of `ops/plans/assessment-restructure.md` in this task.

## Constraints
- Do not modify any file under `src/`, `ops/` (other than deleting the one docsync file), `supabase/`, `.github/`, `CLAUDE.md`, or `package.json`.
- Do not run any Supabase migration, Stripe change, or `npm run` command.
- Do not touch `/api/intake`, `/api/newsletter`, the Google Sheets contract, or lead-scoring logic — this task involves none of them.
- Append only. Do not reorder, rewrite, or remove existing content in the three memory files; each block goes at the end of its target section exactly as written in the docsync source.
- Match each target file's existing line endings (CRLF) when appending.
- Verify the three appends landed correctly before deleting `assessment-restructure-docsync.md`; if any file is missing its expected section heading (e.g. no `## Open` in `OPEN_QUESTIONS.md`), stop and report rather than guessing placement.
- No changes to brand, copy, or UI — this is a documentation-only operation.

## Execution Prompt
You are working in the repo `C:\Users\farib\tennisbootcamp` (Next.js, git branch `main`). Perform a documentation-only "doc-sync": move three pre-written blocks from a throwaway file into three persistent memory files, then delete the throwaway file. Touch nothing else — no `src/`, no migrations, no product code, and specifically nothing in the intake pipeline (`/api/intake`, `/api/newsletter`, Google Sheets columns, lead scoring).

Source file (already read; contents authoritative): `ops/plans/assessment-restructure-docsync.md`. It contains three clearly-delimited sections whose headings tell you exactly where each goes:

1. Section "Append to `.claude/memory/DECISIONS.md`" — four dated blocks:
   - `### 2026-07-18 — Assessment-first funnel (major product pivot)`
   - `### 2026-07-18 — Group programs become admin-created private cohorts (Supabase-backed)`
   - `### 2026-07-18 — Session attendance & make-up terms`
   - `### 2026-07-18 — Club membership is a pass-through`
   Each has **Decision / Why / Alternatives considered** lines. Append all four verbatim to the **end** of `.claude/memory/DECISIONS.md`.

2. Section "Append to `.claude/memory/OPEN_QUESTIONS.md` (under "## Open")" — four question blocks:
   - `### Club guest provision for 20-minute assessments`
   - `### Winter plan after the outdoor season`
   - `### Restructure config confirmations`
   - `### Assessment block schedule`
   Each has **Question / Blocking / Raised** lines. Append them verbatim within the existing `## Open` section of `.claude/memory/OPEN_QUESTIONS.md` (at the end of that section).

3. Section "Append to `.claude/memory/PROGRESS.md` (end of Session Log)" — one block:
   - `### 2026-07-18 (Cowork planning session — product pivot)` with its bullet list.
   Append it verbatim to the end of the Session Log in `.claude/memory/PROGRESS.md`.

Steps:
1. Read the current contents of all three target files first to confirm each exists and to locate the correct insertion point (end of file for DECISIONS.md and PROGRESS.md's Session Log; end of the `## Open` section for OPEN_QUESTIONS.md). If `OPEN_QUESTIONS.md` has no `## Open` heading, or any target file is missing, **stop and report** — do not guess placement.
2. Append each section's blocks to its target file exactly as written in the source (do not paraphrase, renumber, or reformat). Preserve existing content; append only. Match the files' existing CRLF line endings.
3. After all three appends succeed and you have confirmed each block is present in its target file, delete `ops/plans/assessment-restructure-docsync.md`.
4. Do not delete the docsync file if any append failed or was skipped.

Definition of done: `DECISIONS.md`, `OPEN_QUESTIONS.md`, and `PROGRESS.md` each contain their new 2026-07-18 content in the right section; `ops/plans/assessment-restructure-docsync.md` no longer exists; nothing under `src/`, `supabase/`, `.github/`, `CLAUDE.md`, `package.json`, or any other `ops/` file was changed; no build, migration, or npm command was run. Do not start Phase 1 — that is a separate, larger task to be scoped on its own after this docsync lands.

---

## Execution Prompt
You are working in the repo `C:\Users\farib\tennisbootcamp` (Next.js, git branch `main`). Perform a documentation-only "doc-sync": move three pre-written blocks from a throwaway file into three persistent memory files, then delete the throwaway file. Touch nothing else — no `src/`, no migrations, no product code, and specifically nothing in the intake pipeline (`/api/intake`, `/api/newsletter`, Google Sheets columns, lead scoring).

Source file (already read; contents authoritative): `ops/plans/assessment-restructure-docsync.md`. It contains three clearly-delimited sections whose headings tell you exactly where each goes:

1. Section "Append to `.claude/memory/DECISIONS.md`" — four dated blocks:
   - `### 2026-07-18 — Assessment-first funnel (major product pivot)`
   - `### 2026-07-18 — Group programs become admin-created private cohorts (Supabase-backed)`
   - `### 2026-07-18 — Session attendance & make-up terms`
   - `### 2026-07-18 — Club membership is a pass-through`
   Each has **Decision / Why / Alternatives considered** lines. Append all four verbatim to the **end** of `.claude/memory/DECISIONS.md`.

2. Section "Append to `.claude/memory/OPEN_QUESTIONS.md` (under "## Open")" — four question blocks:
   - `### Club guest provision for 20-minute assessments`
   - `### Winter plan after the outdoor season`
   - `### Restructure config confirmations`
   - `### Assessment block schedule`
   Each has **Question / Blocking / Raised** lines. Append them verbatim within the existing `## Open` section of `.claude/memory/OPEN_QUESTIONS.md` (at the end of that section).

3. Section "Append to `.claude/memory/PROGRESS.md` (end of Session Log)" — one block:
   - `### 2026-07-18 (Cowork planning session — product pivot)` with its bullet list.
   Append it verbatim to the end of the Session Log in `.claude/memory/PROGRESS.md`.

Steps:
1. Read the current contents of all three target files first to confirm each exists and to locate the correct insertion point (end of file for DECISIONS.md and PROGRESS.md's Session Log; end of the `## Open` section for OPEN_QUESTIONS.md). If `OPEN_QUESTIONS.md` has no `## Open` heading, or any target file is missing, **stop and report** — do not guess placement.
2. Append each section's blocks to its target file exactly as written in the source (do not paraphrase, renumber, or reformat). Preserve existing content; append only. Match the files' existing CRLF line endings.
3. After all three appends succeed and you have confirmed each block is present in its target file, delete `ops/plans/assessment-restructure-docsync.md`.
4. Do not delete the docsync file if any append failed or was skipped.

Definition of done: `DECISIONS.md`, `OPEN_QUESTIONS.md`, and `PROGRESS.md` each contain their new 2026-07-18 content in the right section; `ops/plans/assessment-restructure-docsync.md` no longer exists; nothing under `src/`, `supabase/`, `.github/`, `CLAUDE.md`, `package.json`, or any other `ops/` file was changed; no build, migration, or npm command was run. Do not start Phase 1 — that is a separate, larger task to be scoped on its own after this docsync lands.

---

## Execution Output
Done. The doc-sync is complete and verified.

## What changed

Three persistent memory files (each already carried the appended blocks verbatim, CRLF-preserved):

- **`.claude/memory/DECISIONS.md`** — four `### 2026-07-18` decision blocks appended at end of file (funnel pivot, private cohorts, attendance/make-up terms, club pass-through).
- **`.claude/memory/OPEN_QUESTIONS.md`** — four question blocks inserted at the end of the existing `## Open` section (before the `---` / "Resolved" divider): club guest provision, winter plan, restructure config confirmations, assessment block schedule.
- **`.claude/memory/PROGRESS.md`** — the `### 2026-07-18 (Cowork planning session — product pivot)` block appended at the end of the Session Log.

Then deleted **`ops/plans/assessment-restructure-docsync.md`**.

## Verification

- All four decision headings, four question headings, and the one progress heading are present exactly once, in the correct sections.
- Line endings stayed CRLF in all three files (CR count == LF count; no LF-only lines introduced).
- Content was sliced directly from the source file (not retyped), so the blocks are byte-verbatim.
- Existing content preserved — appends/insert only.
- Source file confirmed deleted.

## Guardrails respected

- Only the three memory files were modified. The other entries in `git status` (`CLAUDE.md`, `ops/controller/run-task.mjs`, `settings.local.json`, `.claude/agents/`, etc.) were all already present/modified in the starting snapshot and were **not** touched by me.
- Nothing under `src/`, `supabase/`, `.github/`, `package.json`, or the intake pipeline was changed. No build, migration, or npm command was run.
- Phase 1 was **not** started — that remains a separate task.

Note: `OPEN_QUESTIONS.md` and `PROGRESS.md` already had pre-existing uncommitted edits before this task; my appends were added to their current on-disk contents, as intended.