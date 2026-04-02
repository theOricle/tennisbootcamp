
"use client";


export function EmailCapture() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-10">
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 md:flex md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Registrations coming soon</h2>
          <p className="mt-1 text-sm text-white/70">
            Enter your email address to be updated when lessons are available.
          </p>
        </div>

        <form
          className="mt-4 flex w-full gap-3 md:mt-0 md:w-auto"
          onSubmit={(e) => {
            e.preventDefault();
            alert("Hook this up to Mailchimp / ConvertKit / Tally later.");
          }}
        >
          <input
            className="w-full rounded-xl border border-white/10 bg-[#061427] px-4 py-3 text-sm text-white placeholder:text-white/40 md:w-72"
            type="email"
            required
            placeholder="Your email"
          />
          <button
            className="rounded-xl bg-emerald-300 px-5 py-3 text-sm font-semibold text-black hover:brightness-110"
            type="submit"
          >
            Submit
          </button>
        </form>
      </div>
    </section>
  );
}
