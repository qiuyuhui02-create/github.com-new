import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";
function gitValue(args: string[]) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}
const commit =
  process.env.VERCEL_GIT_COMMIT_SHA || gitValue(["rev-parse", "HEAD"]);
const config: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_COMMIT: /^[a-f0-9]{40}$/i.test(commit)
      ? commit
      : "unknown",
    NEXT_PUBLIC_BUILD_BRANCH:
      process.env.VERCEL_GIT_COMMIT_REF ||
      gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
  },
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
