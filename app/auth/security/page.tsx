import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { canSetPassword } from "@/lib/auth/passwords";
import SetPassword from "@/components/auth/set-password";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "账号安全 · aikari",
  robots: { index: false, follow: false },
};
export default async function SecurityPage() {
  const client = await createClient();
  let user = null;
  if (client) {
    try {
      const result = await client.auth.getUser();
      if (!result.error) user = result.data.user;
    } catch {
      /* Fall back to authenticated login; never trust client-provided identity. */
    }
  }
  if (!user) redirect("/auth/login?reason=login_required");
  return (
    <main className="auth-shell">
      <section className="panel">
        <div className="eyebrow">aikari</div>
        <h1>账号安全</h1>
        <p className="help">当前邮箱：{user.email || "未提供邮箱"}</p>
        {canSetPassword(user) ? (
          <>
            <h2>设置密码</h2>
            <SetPassword />
          </>
        ) : (
          <p className="auth-error" role="alert">
            邮箱尚未验证，暂不能设置密码。请先使用原邮箱的 Magic Link 完成验证。
          </p>
        )}
        <a className="text-button" href="/auth/login?mode=magic">
          使用 Magic Link 重新登录
        </a>
        <a className="text-button" href="/">
          返回工作台
        </a>
      </section>
    </main>
  );
}
