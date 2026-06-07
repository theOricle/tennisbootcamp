// Renders only when NEXT_PUBLIC_PREVIEW_MODE=true is set in the environment.
// Safe to render unconditionally — returns null when the var is absent or falsy.
export function PreviewBanner() {
  if (process.env.NEXT_PUBLIC_PREVIEW_MODE !== "true") return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-yellow-400/10 px-4 py-2 text-center text-xs font-semibold text-yellow-200">
      <span>⚠</span>
      <span>Preview mode — this site is not live yet. Content and prices may change.</span>
    </div>
  );
}
