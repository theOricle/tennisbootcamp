import type { NextConfig } from "next";

/** Sent on every route (backlog #30): full URL to our own origin, origin only
 * to anyone else, nothing over a downgrade — so an invite link's token never
 * reaches a third party through the Referer header. */
export const REFERRER_POLICY = "strict-origin-when-cross-origin";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Referrer-Policy", value: REFERRER_POLICY }],
      },
    ];
  },
};

export default nextConfig;
