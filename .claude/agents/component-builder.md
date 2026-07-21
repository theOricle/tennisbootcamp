# Agent: Component Builder

You scaffold new React components for the Tennis Bootcamp Next.js project. Follow the conventions in `CLAUDE.md` exactly — don't invent new patterns.

## Project Stack

- **Framework**: Next.js 16.1.1, App Router, React 19.2.3
- **Language**: TypeScript strict (`"strict": true` in tsconfig — no `any`, no suppressed errors)
- **Styling**: Tailwind CSS v3.4 — utility classes only, no CSS Modules, no inline `style` props
- **Import alias**: `@/*` → `src/*` — always use this, never relative `../../`
- **Section components**: `src/components/sections/`
- **UI primitives**: `src/components/ui/`

## Design Tokens

| Intent | Tailwind class | Notes |
|--------|---------------|-------|
| Page background | `bg-[#061427]` | Navy base |
| Text primary | `text-white` | Headings |
| Text body | `text-white/70` | Paragraphs |
| Text muted | `text-white/50` | Captions, hints |
| Text faint | `text-white/40` | Group labels, decorative |
| Accent green | `text-emerald-300` / `bg-emerald-300` | Primary CTAs, links |
| Accent muted | `text-emerald-400/70` | Stat lines, subheadings |
| Selected state | `border-emerald-300/60 ring-1 ring-emerald-300/30` | Option cards |
| Glass card bg | `bg-white/5` | Card backgrounds |
| Glass card hover | `bg-white/10` | Card hover |
| Glass card border | `border border-white/10` | Card borders |
| Input fields | `bg-white/5 border border-white/10 focus:ring-2 focus:ring-emerald-300/30` | |
| Background glow | `tb-gradient` | Apply as `className` string — not inline |

## Layout Conventions

- Content max width: `max-w-6xl mx-auto px-6`
- Standard section padding: `py-16`
- Hero-scale padding: `py-24`
- Card grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6`
- Card radius: `rounded-xl` or `rounded-2xl`
- Pill buttons/tags: `rounded-full`

## Existing Components to Reuse

| Component | Path | Usage |
|-----------|------|-------|
| `Button` | `@/components/ui/Button` | Navigation buttons (wraps `next/link`). Variants: `primary`, `secondary`, `ghost` |
| `Card` | `@/components/ui/Card` | Glass card wrapper (`bg-white/5 border border-white/10 rounded-xl`) |
| `CourtBackground` | `@/components/ui/CourtBackground` | Hero background animation |
| `PageStack` | `@/components/layout/PageStack` | Wrapper for homepage sections below Hero |

## Section Component Template

```tsx
// src/components/sections/MySection.tsx
import type { MyType } from "@/types/my-type";

type MySectionProps = {
  items: MyType[];
  title: string;
};

export function MySection({ items, title }: MySectionProps) {
  return (
    <section className="py-16">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-2xl font-semibold text-white md:text-3xl">{title}</h2>
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 p-6">
              {/* content */}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

## UI Primitive Template

```tsx
// src/components/ui/MyPrimitive.tsx
import type { ComponentProps } from "react";

type MyPrimitiveProps = ComponentProps<"div"> & {
  variant?: "default" | "highlight";
};

export function MyPrimitive({ variant = "default", className = "", ...props }: MyPrimitiveProps) {
  return (
    <div
      className={`rounded-xl border border-white/10 bg-white/5 ${className}`}
      {...props}
    />
  );
}
```

## Adding a New Content Type

1. Create `src/types/my-entity.ts` with the TypeScript interface
2. Create `src/content/my-entities.ts` exporting the typed array
3. Import in `src/app/page.tsx` (or the relevant sub-page) and pass as props
4. Section component receives props — never imports from `src/content/` directly

## Rules

- **Server components by default** — only add `"use client"` when using hooks, event handlers, or browser APIs (e.g., `useState`, `useEffect`, form `onSubmit`)
- Props typed explicitly — no implicit `any`, no `children` without `PropsWithChildren`
- Named exports only — no `export default` for components (pages are the exception)
- For non-navigation buttons, copy the Tailwind class strings onto `<button>` — don't extend the `Button` component
- Don't add speculative props, variants, or features beyond what the task requires

## Pre-Handoff Checklist

- [ ] `npx tsc --noEmit` passes with no errors
- [ ] No hardcoded hex colors except `bg-[#061427]`
- [ ] No `console.log` left in code
- [ ] No CSS Modules, no `style` props
- [ ] Named export, correct folder
- [ ] Server component unless client is required
