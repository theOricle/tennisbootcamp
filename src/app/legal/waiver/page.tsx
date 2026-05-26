import type { Metadata } from "next";
import { WaiverBackButton } from "./WaiverBackButton";

export const metadata: Metadata = {
  title: "Terms & Liability Waiver",
  description: "Tennis Bootcamp participation agreement and liability waiver.",
};

export default function WaiverPage() {
  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-2xl px-6 py-14">
        {/* Placeholder banner */}
        <div className="mb-8 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-sm text-yellow-200">
          <strong>Placeholder document</strong> — This waiver has not been reviewed by legal
          counsel. It will be replaced with a lawyer-reviewed version before payments are
          collected.
        </div>

        <h1 className="text-2xl font-bold text-white">Terms &amp; Liability Waiver</h1>
        <p className="mt-1 text-sm text-white/40">Version: v0-placeholder-2026-05-24</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-white/75">
          <section>
            <h2 className="mb-2 text-base font-semibold text-white">1. Nature of Activity</h2>
            <p>
              Tennis training involves physical exertion and carries inherent risks, including but
              not limited to: muscle strain, joint injury, falls, and contact with balls, rackets,
              or court surfaces.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">2. Assumption of Risk</h2>
            <p>
              The participant voluntarily assumes all risks associated with participating in Tennis
              Bootcamp programs. The participant acknowledges that Tennis Bootcamp, its coaches,
              staff, and affiliated venues are not liable for injuries arising from normal
              participation.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">3. Waiver of Liability</h2>
            <p>
              To the fullest extent permitted by law, the participant (and parent/guardian for
              minors) waives any claims against Tennis Bootcamp, its coaches, employees, agents,
              and the facilities used, for any injury, loss, or damage arising from participation
              in programs.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">4. Medical Authorization</h2>
            <p>
              The participant confirms they are in adequate physical condition to participate and
              have obtained any necessary medical clearance. In the event of an emergency, Tennis
              Bootcamp staff are authorized to seek medical assistance on behalf of the participant.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">5. Photo &amp; Media Consent</h2>
            <p>
              Tennis Bootcamp may photograph or record training sessions for promotional and
              educational use. Participants who do not wish to be filmed should notify their coach
              before the session begins.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">6. Cancellation Policy</h2>
            <p className="text-yellow-200/80">
              [Placeholder — cancellation and refund policy to be defined by owner before go-live.]
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">7. Governing Law</h2>
            <p>
              This agreement is governed by the laws of the Province of Ontario, Canada.
            </p>
          </section>
        </div>

        <div className="mt-10">
          <WaiverBackButton />
        </div>
      </div>
    </main>
  );
}
