"use client";
import { useEffect, useState } from "react";
import EmailLogin from "./email-login";
import { type AuthReason } from "@/lib/auth/messages";
export default function LoginShell({ reason }: { reason?: AuthReason }) {
  const [error, setError] = useState(reason);
  useEffect(() => {
    if (location.hash) {
      setError(reason || "missing_credentials");
      history.replaceState(null, "", "/auth/login");
    }
  }, [reason]);
  return (
    <main className="auth-shell">
      <section className="panel">
        <div className="eyebrow">FRAMEWORK STUDIO</div>
        <h1>邮箱登录</h1>
        <EmailLogin
          reason={error}
          onSuccess={() => location.assign("/?auth=success")}
        />
        <a className="text-button" href="/">
          返回工作台（保留本地数据）
        </a>
      </section>
    </main>
  );
}
