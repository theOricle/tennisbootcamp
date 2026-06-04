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
        <h1 className="text-2xl font-bold text-white">Refund &amp; Cancellation Policy</h1>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-white/75">
          <p>
            We understand that plans change. Our policy is designed to be fair to
            both you and the other athletes in your cohort, who depend on a stable,
            committed group to get the most out of training.
          </p>

          <section>
            <h2 className="mb-4 text-base font-semibold text-white">Cohort cancellations</h2>
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="font-semibold text-white">
                  7 or more days before your cohort starts
                </p>
                <p className="mt-1">
                  Full refund, minus a $25 administrative fee.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="font-semibold text-white">
                  3 to 6 days before your cohort starts
                </p>
                <p className="mt-1">
                  Choose either a 50% refund (minus the $25 admin fee) or a full
                  credit toward any future cohort, valid for 12 months.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="font-semibold text-white">
                  Less than 3 days before, or any time after the cohort has started
                </p>
                <p className="mt-1">
                  No refund, except in documented extenuating circumstances (see
                  below).
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">
              Extenuating circumstances
            </h2>
            <p>
              If you need to withdraw due to injury, illness, or family emergency,
              contact us as soon as possible at{" "}
              <a
                href="mailto:info@tennisbootcamp.ca"
                className="text-[#B4E655] hover:underline"
              >
                info@tennisbootcamp.ca
              </a>
              . With supporting documentation (medical note, etc.) we&apos;ll issue
              a prorated credit toward a future cohort, valid for 12 months. We do
              not issue cash refunds after a cohort has started, regardless of
              circumstance.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">
              How to request a refund
            </h2>
            <p>
              Email{" "}
              <a
                href="mailto:info@tennisbootcamp.ca"
                className="text-[#B4E655] hover:underline"
              >
                info@tennisbootcamp.ca
              </a>{" "}
              with your name, the cohort you enrolled in, and the reason for
              withdrawal. Approved refunds are processed within 5 business days;
              depending on your bank, the funds may take an additional 5–10 days to
              appear in your account.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">
              Cancellation by Tennis Bootcamp
            </h2>
            <p>
              If we cancel a cohort for any reason (insufficient enrollment,
              facility unavailability, weather), you&apos;ll receive a full refund
              with no administrative fee, or the option to transfer your enrollment
              to a different cohort at no additional cost.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">Questions</h2>
            <p>
              Reach out to{" "}
              <a
                href="mailto:info@tennisbootcamp.ca"
                className="text-[#B4E655] hover:underline"
              >
                info@tennisbootcamp.ca
              </a>{" "}
              and we&apos;ll get back to you within one business day.
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
