/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "-apple-system", "sans-serif"],
      },
      // The Court Plate's one-shot reveal on program detail pages (audit H1,
      // design specs §4.8): traces wipe left to right, shadows fade in, bounce
      // marks and the target ring pop. Used only behind `motion-safe:`, once,
      // filling backwards so the finished plate is static.
      keyframes: {
        "plate-wipe": {
          from: { clipPath: "inset(0 100% 0 0)" },
          to: { clipPath: "inset(0 0 0 0)" },
        },
        "plate-pop": {
          from: { opacity: "0", transform: "scale(0.4)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "plate-fade": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        "plate-wipe": "plate-wipe 900ms cubic-bezier(0.22, 1, 0.36, 1) backwards",
        "plate-pop": "plate-pop 240ms cubic-bezier(0.22, 1, 0.36, 1) backwards",
        "plate-fade": "plate-fade 300ms ease-out backwards",
      },
    },
  },
  plugins: [],
};
