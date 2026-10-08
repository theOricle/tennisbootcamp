# Project Brief — TennisBootcamp.ca

## Project Name
TennisBootcamp.ca

Updated 2026-10-08 (backlog #17). `CLAUDE.md` holds the full current snapshot; this brief is the short version the legacy `agent:run` controller still loads.

## Goal
Build a premium tennis training site with quiz-driven lead capture. Every design and copy decision should serve conversion, trust, and athletic credibility.

## Primary Conversion
**Take the 2-minute quiz** → `/intake` (owner 2026-10-02). "Book Your Assessment" → `/assessment/book` is the optional $20 extra, never the primary CTA.

## Secondary Conversion
Newsletter signup

## Current Working Systems
- The 2-minute quiz (`/intake`) posting to `/api/intake`
- Google Sheets lead storage: a 29-column row (1–22 locked, 23–29 lead source), defined in `src/lib/intakeRow.ts`
- Lead scoring logic based on intake responses
- Supabase accounts, households, assessments and admin-built private cohorts
- Apps Script for formatting and sorting leads in the spreadsheet

## Non-Negotiables
1. Do not break the intake flow or its Sheet column contract under any circumstances
2. No fake design approximations — when an exact reference is required, use it
3. Keep the site athletic, premium, and clean at all times
4. All changes must be tested against the intake form pipeline before being considered complete
