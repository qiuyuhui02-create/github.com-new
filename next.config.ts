import type { NextConfig } from "next";
const config: NextConfig = {
  async headers() {
    return [
      {
        source: "/auth/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
        ],
      },
      {
        source: "/auth/confirm",
        headers: [{ key: "Referrer-Policy", value: "same-origin" }],
      },
    ];
  },
};
export default config;
