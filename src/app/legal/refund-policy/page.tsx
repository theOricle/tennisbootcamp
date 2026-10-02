import type { Metadata } from "next";
import { RefundPolicyBackButton } from "./RefundPolicyBackButton";
import {
  ADMIN_FEE_CAD,
  ASSESSMENT_CREDIT_MONTHS,
  COOLING_OFF_DAYS,
  EFFECTIVE_DATE,
  MAKEUP_WEEKS_FALL_2026,
} from "@/content/policies";

export const metadata: Metadata = {
  title: "Program Policies",
  description:
    "Tennis Bootcamp program policies: cancellation, refunds, make-ups, instalments, the $20 assessment and club membership.",
};

const EMAIL = "info@tennisbootcamp.ca";

function EmailLink() {
  return (
    <a href={`mailto:${EMAIL}`} className="text-[#B4E655] hover:underline">
      {EMAIL}
    </a>
  );
}

const fallMakeups =
  MAKEUP_WEEKS_FALL_2026 === 0
    ? "have none"
    : `have ${MAKEUP_WEEKS_FALL_2026} week${MAKEUP_WEEKS_FALL_2026 === 1 ? "" : "s"}`;

export default function RefundPolicyPage() {
  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-2xl px-6 py-14">
        {/* Interim banner */}
        <div className="mb-8 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-sm italic text-yellow-200">
          Interim, pending legal review. These policies replace our previously
          published refund policy and apply to every program purchased from{" "}
          {EFFECTIVE_DATE}. Counsel is reviewing them. If anything changes we will
          email everyone affected, and the change applies going forward, not
          backward.
        </div>

        <h1 className="text-2xl font-bold text-white">Program Policies</h1>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-white/75">
          <section>
            <h2 className="mb-3 text-base font-semibold text-white">What you&apos;re buying</h2>
            <p>
              A cohort is a fixed group that meets once a week for six weeks. Youth
              Programs, High Performance and Adult Bootcamps: one 60-minute session a
              week, $35 a session, $210 for the six weeks. Kids&apos; Summer Camp: $499
              per week, summer only. Six players per court is the standard cap and
              eight is the maximum.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">
              What you get in writing, and when
            </h2>
            <p>
              You see these policies and the consent items before you pay, and we
              email you the written agreement before any payment is taken: the
              program, the dates, the price, these policies, and the consents you
              gave. Keep that email — the {COOLING_OFF_DAYS}-day window below is
              counted from it.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">
              Cancelling in the first {COOLING_OFF_DAYS} days — no reason needed
            </h2>
            <p>
              You can cancel for any reason within {COOLING_OFF_DAYS} days and get a
              full refund, with no fee of any kind. The {COOLING_OFF_DAYS} days run
              from the later of two dates: the day you receive the written agreement,
              and the day of your cohort&apos;s first session. No administration fee
              applies inside this window.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">
              Cancelling after those {COOLING_OFF_DAYS} days, before your cohort starts
            </h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                7 or more days before the first session: full refund, less a ${ADMIN_FEE_CAD}{" "}
                administration fee.
              </li>
              <li>
                3 to 6 days before the first session: 50% refund, or full credit
                toward another program, your choice.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">
              If a cohort doesn&apos;t run
            </h2>
            <p>
              A cohort runs once at least five players have paid. If we can&apos;t
              reach five, you choose: a full refund, or your payment moved to another
              cohort. We tell you which it is as soon as the invite hold ends, and
              always before the scheduled first session.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">
              Once your cohort has started
            </h2>
            <p>
              Sessions you miss are not refunded. Sessions we cancel are made up
              inside your cohort&apos;s make-up window, which your written agreement
              states; fall 2026 cohorts {fallMakeups} because the season closes on
              November 15. Any cancelled session the window can&apos;t hold becomes a
              credit on your account rather than a session you lose.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">Paying in instalments</h2>
            <p>
              You can pay in full, or in two equal monthly instalments at no extra
              cost: 2 × $105 for a six-week cohort. Tell us at <EmailLink /> when you
              enroll and we set it up; once it&apos;s built into checkout you&apos;ll
              pick it there. The total is identical either way. There is no uplift,
              interest, or fee for paying in two parts.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">The $20 assessment</h2>
            <p>
              The assessment is $20, and if you enroll in a program afterward that $20
              comes off the price. If weather cancels your slot, you rebook free —
              your $20 stays with your booking. Assessment credit is valid for{" "}
              {ASSESSMENT_CREDIT_MONTHS} months.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">Club membership</h2>
            <p>
              We train on the club&apos;s courts. Every player holds a current club
              membership: $100 for the season, paid by you directly to the club. It is
              not part of our price, we never charge it, and it never goes through our
              checkout. So a $210 cohort costs a non-member $210 to us, plus $100 to
              the club.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">Questions</h2>
            <p>
              <EmailLink />
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
