import { test, expect } from "@playwright/test";
const fixture = "http://127.0.0.1:54399";
// Run against a build explicitly configured with the loopback Auth fixture only.
test.describe("Auth fixture integration", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(
      process.env.AUTH_FIXTURE_TEST !== "1",
      "Use npm run test:auth:e2e; never send test emails to a real provider.",
    );
    await request.post(fixture + "/__test/reset");
  });
  test("fresh-browser token_hash link waits for confirmation, sets cookies, and survives reload", async ({
    page,
    request,
  }) => {
    await page.goto(
      "/auth/callback?token_hash=valid-hash&type=email&next=https://evil.example",
    );
    await expect(
      page.getByRole("heading", { name: "确认邮箱登录" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/confirm$/);
    expect(
      (await (await request.get(fixture + "/__test/state")).json())
        .hashVerifications,
    ).toBe(0);
    await page.getByRole("button", { name: "确认并登录" }).click();
    await expect(page).toHaveURL(/\/\?auth=success/);
    await page.getByRole("button", { name: "云端设置", exact: true }).click();
    await expect(page.getByText("已登录：owner@example.com")).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "云端设置", exact: true }).click();
    await expect(page.getByText("已登录：owner@example.com")).toBeVisible();
    const state = await (await request.get(fixture + "/__test/state")).json();
    expect(state.hashVerifications).toBe(1);
    expect(state.exchanges).toBe(0);
    expect(state.emails).toBe(0);
    expect(state.databaseRequests).toBe(0);
  });
  test("real PKCE cookies and a root-misdirected code exchange exactly once", async ({
    page,
    request,
  }) => {
    await page.goto("/auth/login?mode=magic");
    await page.getByLabel("邮箱", { exact: true }).fill("owner@example.com");
    await page
      .getByRole("button", { name: "发送登录邮件", exact: true })
      .click();
    await expect(page.locator(".auth-message")).toContainText("已发送");
    await page.request.head("/auth/callback?code=valid-code");
    expect(
      (await (await request.get(fixture + "/__test/state")).json()).exchanges,
    ).toBe(0);
    await page.goto("/?code=valid-code&next=https://evil.example");
    await expect(page).toHaveURL(/\/\?auth=success/);
    await page.getByRole("button", { name: "云端设置", exact: true }).click();
    await expect(page.getByText("已登录：owner@example.com")).toBeVisible();
    const state = await (await request.get(fixture + "/__test/state")).json();
    expect(state.exchanges).toBe(1);
    expect(state.emails).toBe(1);
    expect(state.databaseRequests).toBe(0);
  });
  test("missing verifier leads to OTP fallback, with no automatic resend", async ({
    page,
    request,
  }) => {
    await page.goto("/auth/callback?code=private-secret");
    await expect(page).toHaveURL(/reason=pkce_verifier_missing/);
    await expect(page.locator(".auth-error")).toContainText("PKCE verifier");
    expect(page.url()).not.toContain("private-secret");
    await page.getByLabel("邮箱", { exact: true }).fill("owner@example.com");
    await page.getByText("邮件中已有验证码？", { exact: true }).click();
    await page.getByLabel("邮箱验证码", { exact: true }).fill("12345678");
    await page.getByRole("button", { name: "验证并登录" }).click();
    await expect(page).toHaveURL(/auth=success/);
    const state = await (await request.get(fixture + "/__test/state")).json();
    expect(state.emails).toBe(0);
    expect(state.otpVerifications).toBe(1);
    expect(state.exchanges).toBe(0);
    expect(state.databaseRequests).toBe(0);
  });
  test("send cooldown survives refresh; received OTP can still be verified", async ({
    page,
    request,
  }) => {
    await page.goto("/auth/login?mode=magic");
    await page.getByLabel("邮箱", { exact: true }).fill("owner@example.com");
    await page
      .getByRole("button", { name: "发送登录邮件", exact: true })
      .click();
    await expect(page.locator(".auth-message")).toContainText("已发送");
    await expect(
      page.getByRole("button", { name: "发送登录邮件", exact: true }),
    ).toBeDisabled();
    await page.reload();
    await page.getByLabel("邮箱", { exact: true }).fill("owner@example.com");
    await expect(
      page.getByRole("button", { name: "发送登录邮件", exact: true }),
    ).toBeDisabled();
    await page.getByText("邮件中已有验证码？", { exact: true }).click();
    await page.getByLabel("邮箱验证码", { exact: true }).fill("123456");
    await expect(
      page.getByRole("button", { name: "验证并登录" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "验证并登录" }).click();
    await expect(page).toHaveURL(/auth=success/);
    expect(
      (await (await request.get(fixture + "/__test/state")).json()).emails,
    ).toBe(1);
  });
  test("rate limit stays distinct from expired-link error and never triggers retry", async ({
    page,
    request,
  }) => {
    await page.goto("/auth/login?mode=magic");
    await page.getByLabel("邮箱", { exact: true }).fill("limited@example.com");
    await page
      .getByRole("button", { name: "发送登录邮件", exact: true })
      .click();
    await expect(page.locator(".auth-message")).toContainText("邮件发送已限流");
    await expect(
      page.getByRole("button", { name: "发送登录邮件", exact: true }),
    ).toBeDisabled();
    await page.waitForTimeout(300);
    expect(
      (await (await request.get(fixture + "/__test/state")).json()).emails,
    ).toBe(1);
  });
  test("used token does not erase the existing session; errors redact credentials", async ({
    page,
    request,
  }) => {
    await page.goto("/auth/callback?token_hash=valid-hash&type=email");
    await page.getByRole("button", { name: "确认并登录" }).click();
    await expect(page).toHaveURL(/auth=success/);
    await page.goto("/auth/callback?token_hash=valid-hash&type=email");
    await page.getByRole("button", { name: "确认并登录" }).click();
    await expect(page).toHaveURL(/reason=expired/);
    expect(page.url()).not.toContain("valid-hash");
    await expect(page.locator(".auth-error")).toContainText("已过期");
    await page
      .getByRole("link", { name: "返回工作台（保留本地数据）" })
      .click();
    await page.getByRole("button", { name: "云端设置", exact: true }).click();
    await expect(page.getByText("已登录：owner@example.com")).toBeVisible();
    expect(
      (await (await request.get(fixture + "/__test/state")).json())
        .databaseRequests,
    ).toBe(0);
  });
});
