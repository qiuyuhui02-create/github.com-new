import { test, expect } from "@playwright/test";
import { seed } from "../../lib/model";
test("mocked provider: login isolates demo, load/save all modules, import images, conflict, sign out", async ({
  page,
}) => {
  const owner = "11111111-1111-4111-8111-111111111111";
  const authUser = {
    id: owner,
    aud: "authenticated",
    role: "authenticated",
    email: "alice@example.com",
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: new Date().toISOString(),
  };
  const payload = Buffer.from(
    JSON.stringify({
      sub: owner,
      exp: Math.floor(Date.now() / 1000) + 3600,
      role: "authenticated",
      aud: "authenticated",
      email: authUser.email,
    }),
  ).toString("base64url");
  const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.test-signature`;
  let cloud = structuredClone(seed),
    version = 3,
    uploads = 0,
    forceConflict = false;
  await page.route("https://*.supabase.co/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    const json = (data: unknown, status = 200) =>
      route.fulfill({ status, json: data });
    if (path === "/auth/v1/otp") return json({});
    if (path === "/auth/v1/verify")
      return json({
        access_token: token,
        refresh_token: "test-refresh",
        token_type: "bearer",
        expires_in: 3600,
        user: authUser,
      });
    if (path === "/auth/v1/user") return json(authUser);
    if (path === "/auth/v1/logout") return json({});
    if (path === "/rest/v1/studio_projects")
      return json({
        data: cloud,
        version,
        updated_at: new Date().toISOString(),
      });
    if (path === "/rest/v1/rpc/save_studio_project") {
      const body = req.postDataJSON();
      expect(req.headers().authorization).toBe(`Bearer ${token}`);
      if (forceConflict || body.expected_version !== version)
        return json({ code: "40001", message: "Project changed" }, 409);
      cloud = body.project_data;
      version++;
      return json([{ version, updated_at: new Date().toISOString() }]);
    }
    if (path.startsWith("/storage/v1/object/sign/"))
      return json({ signedURL: "/object/sign/assets/test?token=fake" });
    if (path.startsWith("/storage/v1/object/assets/")) {
      uploads++;
      return json({ Key: "assets/test" });
    }
    // No live provider requests are allowed during this test.
    return json({ message: `Unmocked provider path: ${path}` }, 500);
  });
  await page.goto("/");
  await expect(page.locator(".asset-card")).toHaveCount(6);
  await page
    .getByRole("button", { name: "项目与云端设置", exact: true })
    .click();
  await page.getByLabel("邮箱", { exact: true }).fill(authUser.email);
  test.skip(
    await page.getByRole("button", { name: "发送登录邮件" }).isDisabled(),
    "此用例需要构建时配置 Supabase 公共 URL/Key；全部服务请求将被模拟。",
  );
  await page.getByRole("button", { name: "发送登录邮件" }).click();
  await expect(page.locator(".toast")).toContainText("登录邮件已发送");
  await page.getByLabel("邮件验证码（可选）").fill("123456");
  await page.getByRole("button", { name: "验证并登录" }).click();
  await expect(page.getByText(`已登录：${authUser.email}`)).toBeVisible();
  await expect(page.locator(".asset-card")).toHaveCount(0);
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "从云端载入", exact: true }).click();
  await expect(page.locator(".asset-card")).toHaveCount(6);
  await page.getByRole("button", { name: "推送到云端", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("已保存到云端");
  expect(version).toBe(4);
  expect(cloud.shots).toHaveLength(3);
  expect(cloud.tasks).toHaveLength(3);
  expect(cloud.prompts).toHaveLength(2);
  const backup = structuredClone(seed);
  backup.assets[0].name = "备份角色";
  backup.assets[0].image = "data:image/png;base64,aGVsbG8=";
  await page
    .locator(".upload-button")
    .filter({ hasText: "导入 JSON 备份到云端" })
    .locator("input")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
  await expect(page.locator(".toast")).toContainText("已保存到云端");
  await expect.poll(() => version).toBe(5);
  expect(uploads).toBe(1);
  expect(cloud.assets[0].image).toMatch(/^storage:/);
  expect(cloud.assets[0].name).toBe("备份角色");
  forceConflict = true;
  await page.getByRole("button", { name: "推送到云端", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("云端项目已更新");
  expect(version).toBe(5);
  await page.getByRole("button", { name: "退出", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "发送登录邮件" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭窗口" }).click();
  await expect(page.locator(".asset-card").first()).toContainText(
    "林 · 城市漫游者",
  );
});
