"use client";
import { useEffect, useState } from "react";
import type { EmailLinkType } from "@/lib/auth/parameters";
export default function ConfirmEmail({
  tokenHash,
  type,
}: {
  tokenHash: string;
  type: EmailLinkType;
}) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    history.replaceState(null, "", "/auth/confirm");
  }, []);
  return (
    <main className="auth-shell">
      <section className="panel">
        <div className="eyebrow">aikari</div>
        <h1>确认邮箱登录</h1>
        <p className="help">
          请仅在这封邮件属于你、且你刚刚发起登录时继续。打开页面不会消耗令牌；点击下面按钮才验证。
        </p>
        <form
          action="/auth/callback"
          method="post"
          onSubmit={(e) => {
            if (busy) {
              e.preventDefault();
              return;
            }
            setBusy(true);
          }}
        >
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          <button className="primary" disabled={busy} type="submit">
            {busy ? "正在验证…" : "确认并登录"}
          </button>
        </form>
        <a className="text-button" href="/auth/login">
          改用邮箱验证码
        </a>
        <a className="text-button" href="/">
          返回工作台，不验证此链接
        </a>
      </section>
    </main>
  );
}
