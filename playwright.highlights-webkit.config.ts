import { defineConfig } from "@playwright/test";
// Isolated from PR #11's restore/WebKit configuration. Linux WebKit is not macOS Safari.
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "highlights.spec.ts",
  workers: 1,
  reporter: "list",
  use: {
    browserName: "webkit",
    baseURL: "http://127.0.0.1:3000",
    timezoneId: "Asia/Shanghai",
    headless: true,
  },
});
