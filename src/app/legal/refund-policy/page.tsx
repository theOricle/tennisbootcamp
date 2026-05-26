import type { Metadata } from "next";
import { RefundPolicyBackButton } from "./RefundPolicyBackButton";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "Tennis Bootcamp cancellation and refund policy.",
};

export default function RefundPolicyPage() {
  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-2xl px-6 py-14">
        {/* Placeholder banner */}
        <div className="mb-8 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-sm text-yellow-200">
          <strong>Placeholder document</strong> — This policy has not been reviewed by legal
          counsel. It will be replaced with a final version before payments are collected.
        </div>

        <h1 className="text-2xl font-bold text-white">Refund Policy</h1>
        <p className="mt-1 text-sm text-white/40">Version: v0-placeholder-2026-05-24</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-white/75">
          <section>
            <h2 className="mb-2 text-base font-semibold text-white">1. General</h2>
            <p>
              All enrollments in Tennis Bootcamp programs are subject to this refund policy.
              By completing enrollment, the participant (or guardian, for minors) agrees to
              these terms.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">
              2. Cancellation by Participant
            </h2>
            <p className="text-yellow-200/80">
              [Placeholder — cancellation windows and refund amounts to be defined by owner
              before go-live. Common structure: full refund if cancelled more than X days
              before start date; partial or no refund after that.]
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">
              3. Cancellation by Tennis Bootcamp
            </h2>
            <p>
              If Tennis Bootcamp cancels a cohort, enrolled participants will receive a full
              refund of any amount paid. Tennis Bootcamp will notify participants as early as
              possible.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">4. Missed Sessions</h2>
            <p>
              Refunds are not issued for individual sessions missed by the participant.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">5. How to Request</h2>
            <p>
              To request a cancellation or refund, email{" "}
              <a
                href="mailto:info@tennisbootcamp.ca"
                className="text-[#B4E655] hover:underline"
              >
                info@tennisbootcamp.ca
              </a>{" "}
              with your name, cohort, and reason. We will respond within 3 business days.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">6. Governing Law</h2>
            <p>
              This policy is governed by the laws of the Province of Ontario, Canada.
            </p>
          </section>
        </div>

        <div className="mt-10">
          <RefundPolicyBackButton />
        </div>
      </div>
    </main>
  );
}
