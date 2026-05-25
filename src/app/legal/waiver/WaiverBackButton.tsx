"use client";

export function WaiverBackButton() {
  return (
    <button
      type="button"
      onClick={() => window.history.back()}
      className="text-sm text-white/40 hover:text-white transition-colors"
    >
      ← Back
    </button>
  );
}
