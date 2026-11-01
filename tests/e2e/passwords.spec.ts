import { test, expect } from "@playwright/test";
const fixture = "http://127.0.0.1:54399",
  password = "Test-only-correct-2026";
test.describe("password setup and login using Auth fixture", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(
      process.env.AUTH_FIXTURE_TEST !== "1",
      "Use test:auth:e2e; never update real user passwords.",
    );
    await request.post(fixture + "/__test/reset");
  });
  test("existing user verifies default Magic Link, sets password, and logs in on another device without email", async ({
    page,
    request,
    browser,
  }) => {
    await page.goto("/auth/login");
    await expect(
      page.getByRole("button", { name: "密码登录", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Magic Link 备用" }).click();
    await page.getByLabel("邮箱", { exact: true }).fill("owner@example.com");
    await page
      .getByRole("button", { name: "发送登录邮件", exact: true })
      .click();
    await expect(page.locator(".auth-message")).toContainText("登录邮件已发送");
    await page.goto("/auth/callback?code=valid-code");
    await expect(page).toHaveURL(/auth=success/);
    await page.getByRole("button", { name: "云端设置", exact: true }).click();
    await page.getByRole("link", { name: "账号安全 · 设置密码" }).click();
    await expect(
      page.getByRole("heading", { name: "账号安全", exact: true }),
    ).toBeVisible();
    await page.getByLabel("新密码", { exact: true }).fill(password);
    await page
      .getByLabel("再次输入新密码", { exact: true })
      .fill("different-value");
    await page.getByRole("button", { name: "保存密码" }).click();
    await expect(page.locator(".auth-error")).toContainText("不一致");
    expect(
      (await (await request.get(fixture + "/__test/state")).json())
        .passwordUpdateAttempts,
    ).toBe(0);
    await page.getByLabel("再次输入新密码", { exact: true }).fill(password);
    await page.getByRole("button", { name: "保存密码" }).click();
    await expect(page.locator(".auth-message")).toContainText("密码已设置");
    await expect(page.getByLabel("新密码", { exact: true })).toHaveValue("");
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    try {
      const next = await mobile.newPage();
      await next.goto("http://127.0.0.1:3000/auth/login");
      await next.getByLabel("邮箱", { exact: true }).fill("owner@example.com");
      await next.getByLabel("密码", { exact: true }).fill("wrong-password");
      await next.getByRole("button", { name: "密码登录", exact: true }).click();
      await expect(next.locator(".auth-message")).toContainText(
        "邮箱或密码不正确",
      );
      await next.getByLabel("密码", { exact: true }).fill(password);
      await next.getByRole("button", { name: "密码登录", exact: true }).click();
      await expect(next).toHaveURL(/auth=success/);
      await next.getByRole("button", { name: "云端设置", exact: true }).click();
      await expect(next.getByText("已登录：owner@example.com")).toBeVisible();
      const keys = await next.evaluate(() => Object.keys(localStorage));
      expect(keys).toContain(
        "framework-studio-v2:user:11111111-1111-4111-8111-111111111111",
      );
      expect(
        await next.evaluate(() => JSON.stringify(localStorage)),
      ).not.toContain(password);
    } finally {
      await mobile.close();
    }
    const state = await (await request.get(fixture + "/__test/state")).json();
    expect(state.emails).toBe(1);
    expect(state.passwordUpdates).toBe(1);
    expect(state.passwordLogins).toBe(2);
    expect(state.userCreations).toBe(0);
    expect(state.userDeletions).toBe(0);
    expect(state.databaseRequests).toBe(0);
  });
  test("anonymous and email-unverified sessions cannot set a password", async ({
    page,
    request,
  }) => {
    const anonymous = await request.post("/auth/password", {
      headers: { Origin: "http://127.0.0.1:3000" },
      data: { password, confirmation: password },
    });
    expect(anonymous.status()).toBe(401);
    await page.goto("/auth/security");
    await expect(page).toHaveURL(/reason=login_required/);
    await request.post(fixture + "/__test/config", {
      data: { emailVerified: false },
    });
    await page.goto("/auth/callback?token_hash=valid-hash&type=email");
    await page.getByRole("button", { name: "确认并登录" }).click();
    await expect(page).toHaveURL(/auth=success/);
    await page.goto("/auth/security");
    await expect(page.locator(".auth-error")).toContainText("邮箱尚未验证");
    await expect(page.getByLabel("新密码", { exact: true })).toHaveCount(0);
    const denied = await page.request.post("/auth/password", {
      headers: { Origin: "http://127.0.0.1:3000" },
      data: { password, confirmation: password },
    });
    expect(denied.status()).toBe(403);
    const state = await (await request.get(fixture + "/__test/state")).json();
    expect(state.passwordUpdateAttempts).toBe(0);
    expect(state.userCreations).toBe(0);
    expect(state.databaseRequests).toBe(0);
  });
  test("reauthentication requirement does not bypass verification or automatically send email", async ({
    page,
    request,
  }) => {
    await page.goto("/auth/callback?token_hash=valid-hash&type=email");
    await page.getByRole("button", { name: "确认并登录" }).click();
    await expect(page).toHaveURL(/auth=success/);
    await request.post(fixture + "/__test/config", {
      data: { requireReauth: true },
    });
    await page.goto("/auth/security");
    await page.getByLabel("新密码", { exact: true }).fill(password);
    await page.getByLabel("再次输入新密码", { exact: true }).fill(password);
    await page.getByRole("button", { name: "保存密码" }).click();
    await expect(page.locator(".auth-error")).toContainText("重新认证");
    await expect(
      page.getByRole("link", { name: "重新认证（Magic Link）" }),
    ).toBeVisible();
    const state = await (await request.get(fixture + "/__test/state")).json();
    expect(state.passwordUpdates).toBe(0);
    expect(state.emails).toBe(0);
    expect(state.databaseRequests).toBe(0);
  });
});
