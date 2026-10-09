import type { Metadata } from "next";
import { PrivacyBackButton } from "./PrivacyBackButton";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What Tennis Bootcamp collects, why, who processes it for us, and how to see, correct or delete your information.",
  alternates: { canonical: "/legal/privacy" },
};

const EFFECTIVE_DATE = "October 8, 2026";

function Email() {
  return (
    <a href="mailto:info@tennisbootcamp.ca" className="text-[#B4E655] hover:underline">
      info@tennisbootcamp.ca
    </a>
  );
}

const PROCESSORS: { name: string; use: string }[] = [
  { name: "Supabase", use: "Accounts and our database." },
  { name: "Vercel", use: "Hosts this website." },
  {
    name: "Resend",
    use: "Sends account links, quiz results, bookings, invitations and receipts.",
  },
  { name: "MailerLite", use: "Sends the newsletter, only if you opt in." },
  {
    name: "Google Sheets",
    use: "Our internal records of quiz answers, newsletter and program-interest sign-ups, assessment bookings and results, and enrollments.",
  },
  { name: "Google Analytics", use: "Measures how the site is used." },
  { name: "Stripe", use: "Processes card payments." },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-2xl px-6 py-14">
        <div className="mb-8 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-sm text-yellow-200">
          <strong>Interim, pending legal review.</strong> This policy describes how the site
          handles your information today. It will be replaced with a lawyer-reviewed version.
        </div>

        <h1 className="text-2xl font-bold text-white">Privacy Policy</h1>
        <p className="mt-1 text-sm text-white/60">Effective {EFFECTIVE_DATE}</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-white/75">
          <section>
            <h2 className="mb-3 text-base font-semibold text-white">Who we are</h2>
            <p>
              Tennis Bootcamp is run by Sina Kassaian in Toronto. Questions about this policy or
              your information go to <Email />.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">What we collect and why</h2>
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="font-semibold text-white">Account and player details</p>
                <p className="mt-1">
                  Names, email, phone, age group, level, availability and any notes you give
                  us. This includes household members an account holder adds, such as a child
                  or a spouse. We ask that a child&apos;s details come from their parent or
                  guardian. We use these to place each player, build groups that fit their
                  schedule, and contact you about training. The site also notes how you found
                  it, for example the link or ad you came from, and saves that with your quiz
                  answers.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="font-semibold text-white">Assessment results</p>
                <p className="mt-1">
                  After an assessment, the level the coach assigns and the coach&apos;s notes on
                  your game. We use these to place you in a group at your level.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="font-semibold text-white">Enrollment details</p>
                <p className="mt-1">
                  When you enroll, each player&apos;s date of birth. For anyone under 18, a
                  parent or guardian&apos;s name, email and phone. We also record the name typed
                  to sign the waiver, when it was signed and which version of the waiver it was.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="font-semibold text-white">Booking, enrollment and payment records</p>
                <p className="mt-1">
                  What you booked or enrolled in, when, and whether it has been paid. We never
                  see or store card numbers: card payments go through Stripe, and e-transfers
                  arrive at our bank.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="font-semibold text-white">Messages you send us</p>
                <p className="mt-1">
                  Emails and requests you send, so we can answer them.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="font-semibold text-white">Photos and video</p>
                <p className="mt-1">
                  We may photograph or film training sessions. Section 5 of the{" "}
                  <a href="/legal/waiver" className="text-[#B4E655] hover:underline">
                    Terms &amp; Liability Waiver
                  </a>{" "}
                  explains how, and how to tell your coach you don&apos;t want to be filmed.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="font-semibold text-white">How the site is used</p>
                <p className="mt-1">
                  Pages visited and steps completed, measured through Google Analytics, so we
                  can see what works on the site and fix what doesn&apos;t. See the Google
                  Analytics section below.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">Who processes it for us</h2>
            <ul className="space-y-2">
              {PROCESSORS.map((p) => (
                <li key={p.name}>
                  <span className="font-semibold text-white">{p.name}</span> — {p.use}
                </li>
              ))}
            </ul>
            <p className="mt-3">
              Some of these services store data outside Canada.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">Email</h2>
            <p>
              Emails about the quiz, your account, bookings, enrollments and invitations to
              groups that fit your level and schedule are sent because you asked us to place
              you. The newsletter only goes to people who opted in. Every newsletter has an
              unsubscribe link, and you can withdraw at any time by emailing <Email />.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">How long we keep it</h2>
            <p>
              We keep your information while your account is open. Newsletter and
              program-interest sign-ups without an account are kept until you unsubscribe or
              ask us to delete them. Ask us and we delete your information, except payment
              records, which we must keep for six years for tax purposes.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">Your rights</h2>
            <p>
              You can ask to see, correct or delete your information by emailing <Email />. We
              reply within 30 days.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">
              Google Analytics and opting out
            </h2>
            <p className="mb-3">
              Google Analytics starts when a page loads and sets cookies in your browser. We
              don&apos;t ask first. Google receives the page address, your device and browser
              type, and your approximate location.
            </p>
            <p>
              Google offers a browser add-on that stops Google Analytics from measuring your
              visits. You can install it from{" "}
              <a
                href="https://tools.google.com/dlpage/gaoptout"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#B4E655] hover:underline"
              >
                tools.google.com/dlpage/gaoptout
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">Changes to this policy</h2>
            <p>
              Changes will be posted on this page with a new effective date.
            </p>
          </section>
        </div>

        <div className="mt-10">
          <PrivacyBackButton />
        </div>
      </div>
    </main>
  );
}
