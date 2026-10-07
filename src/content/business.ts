// Who sends the site's emails to players. Canada's anti-spam law (CASL)
// requires them to identify the sender and how to reach them.
// The repo is public, so the mailing address is never committed: it comes from
// the server env var BUSINESS_MAILING_ADDRESS (set in Vercel). While it is
// unset the sender line leaves the address out.

export const BUSINESS_NAME = "Tennis Bootcamp";
export const OWNER_NAME = "Sina Kassaian";
export const CONTACT_EMAIL = "info@tennisbootcamp.ca";
export const MAILING_ADDRESS = (process.env.BUSINESS_MAILING_ADDRESS ?? "").trim();
