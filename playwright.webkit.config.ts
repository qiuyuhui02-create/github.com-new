import { defineConfig } from "@playwright/test";
// WebKit engine regression, not a substitute for real macOS Safari/system dialogs.
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "backup-import.spec.ts",
  workers: 1,
  reporter: "list",
  use: {
    browserName: "webkit",
    baseURL: "http://127.0.0.1:3000",
    timezoneId: "Asia/Shanghai",
    headless: true,
  },
});
