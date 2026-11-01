"use client";
import { useRef, useState } from "react";
import { passwordValidation } from "@/lib/auth/passwords";
export default function SetPassword() {
  const [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [done, setDone] = useState(false),
    [reauth, setReauth] = useState(false);
  const lock = useRef(false);
  async function submit() {
    if (lock.current) return;
    setDone(false);
    setReauth(false);
    const invalid = passwordValidation(password, confirmation);
    if (invalid) {
      setStatus(invalid);
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const response = await fetch("/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        referrerPolicy: "same-origin",
        body: JSON.stringify({ password, confirmation }),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatus(result.error || "密码设置失败");
        setReauth(
          [
            "reauthentication_required",
            "login_required",
            "email_unverified",
          ].includes(result.code),
        );
        return;
      }
      setDone(true);
      setStatus(
        "密码已设置。账号 ID 不变，可在 Mac、Windows 和手机使用同一邮箱与密码登录。",
      );
    } catch {
      setStatus("网络连接失败，请稍后手动重试。");
    } finally {
      setPassword("");
      setConfirmation("");
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      className="editor-fields auth-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="help">
        仅更新当前账号的密码，不重新注册，不修改项目或资产。至少 12
        个字符；不要与其他网站共用。
      </p>
      <label>
        新密码
        <input
          type="password"
          autoComplete="new-password"
          maxLength={72}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
      </label>
      <label>
        再次输入新密码
        <input
          type="password"
          autoComplete="new-password"
          maxLength={72}
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          disabled={busy}
        />
      </label>
      <button
        className="primary"
        disabled={busy || !password || !confirmation}
        type="submit"
      >
        {busy ? "正在设置…" : "保存密码"}
      </button>
      {status && (
        <p
          role={done ? "status" : "alert"}
          className={done ? "auth-message" : "auth-error"}
        >
          {status}
        </p>
      )}
      {reauth && (
        <a className="text-button" href="/auth/login?mode=magic">
          重新认证（Magic Link）
        </a>
      )}
      {done && (
        <a className="text-button" href="/auth/login">
          打开邮箱＋密码登录
        </a>
      )}
    </form>
  );
}
