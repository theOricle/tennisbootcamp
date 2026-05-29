import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { google } from "googleapis";
import {
  saveEnrollmentToSupabase,
  issueActivationLink,
} from "@/lib/supabase/enrollmentActions";

const TAB = "enrollments";
const STATUS_COL = "P";

async function markEnrollmentPaid(rowNumber: number) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!spreadsheetId || !clientEmail || !rawKey) return;

  const privateKey = rawKey.replace(/\\n/g, "\n").replace(/\r/g, "").trim();
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${TAB}!${STATUS_COL}${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [["paid"]] },
  });
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!webhookSecret || !stripeKey || !sig) {
    return NextResponse.json(
      { error: "Webhook not configured." },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    const stripe = new Stripe(stripeKey);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature error:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const rowNumber = Number(session.metadata?.enrollmentRowNumber);
    const contactEmail = session.metadata?.contactEmail ?? "";
    const supabaseEnrollmentId = session.metadata?.supabaseEnrollmentId ?? null;

    if (rowNumber) {
      await markEnrollmentPaid(rowNumber);
    }

    // If the enrollment wasn't saved to Supabase during checkout creation
    // (e.g. Supabase wasn't configured at checkout time), save it now.
    if (contactEmail && !supabaseEnrollmentId) {
      const cohortId = session.metadata?.cohortId ?? "";
      const newId = await saveEnrollmentToSupabase({
        cohortId,
        contactEmail,
        status: "paid",
      });
      if (newId) {
        await issueActivationLink(contactEmail, newId);
      }
    } else if (supabaseEnrollmentId && contactEmail) {
      // Update existing Supabase row to paid
      const { createServiceClient } = await import("@/lib/supabase/service");
      const supabase = createServiceClient();
      await supabase
        .from("enrollments")
        .update({ status: "paid" })
        .eq("id", supabaseEnrollmentId);
      await issueActivationLink(contactEmail, supabaseEnrollmentId);
    }
  }

  return NextResponse.json({ received: true });
}
