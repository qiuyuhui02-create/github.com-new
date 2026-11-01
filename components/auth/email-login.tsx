"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  authMessages,
  authReason,
  classifyAuthError,
  configuredSiteOrigin,
  type AuthReason,
} from "@/lib/auth/messages";
import { passwordError } from "@/lib/auth/passwords";
import {
  cooldownKey,
  readCooldown,
  SEND_COOLDOWN_MS,
  RATE_LIMIT_COOLDOWN_MS,
} from "@/lib/auth/cooldown";
export default function EmailLogin({
  reason,
  onMessage,
  onSuccess,
  initialMode = "password",
}: {
  reason?: AuthReason;
  initialMode?: "password" | "magic";
  onMessage?: (s: string) => void;
  onSuccess?: () => void;
}) {
  const [email, setEmail] = useState(""),
    [otp, setOtp] = useState(""),
    [busy, setBusy] = useState(false),
    [until, setUntil] = useState(0),
    [now, setNow] = useState(0),
    [origin, setOrigin] = useState(""),
    [status, setStatus] = useState("");
  const [mode, setMode] = useState(initialMode),
    [password, setPassword] = useState("");
  const lock = useRef(false);
  const site = configuredSiteOrigin();
  const storedCooldown = () => {
    try {
      return readCooldown(window.localStorage);
    } catch {
      return 0;
    }
  };
  useEffect(() => {
    setOrigin(location.origin);
    setNow(Date.now());
    setUntil(storedCooldown());
    const update = () => {
      setNow(Date.now());
      setUntil((v) => Math.max(v, storedCooldown()));
    };
    const timer = setInterval(() => setNow(Date.now()), 1000);
    window.addEventListener("storage", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", update);
    };
  }, []);
  function message(text: string) {
    setStatus(text);
    onMessage?.(text);
  }
  function cooldown(milliseconds: number) {
    const end = Date.now() + milliseconds;
    setUntil(end);
    setNow(Date.now());
    try {
      localStorage.setItem(cooldownKey, String(end));
    } catch {
      /* Still enforce this page's in-memory cooldown. */
    }
  }
  const mismatch = !!origin && !!site && site !== origin;
  const invalidConfig = site === "invalid";
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const remaining = Math.max(0, Math.ceil((until - now) / 1000));
  async function send() {
    if (lock.current) return;
    if (!supabase || invalidConfig) return message(authMessages.unconfigured);
    if (mismatch) return message(authMessages.wrong_origin);
    if (!validEmail) return message("请输入有效邮箱");
    const active = Math.max(until, storedCooldown());
    if (active > Date.now()) {
      setUntil(active);
      return message("请等待发送冷却结束；验证码验证不受此冷却限制。");
    }
    lock.current = true;
    setBusy(true);
    cooldown(SEND_COOLDOWN_MS);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: `${location.origin}/auth/callback`,
          shouldCreateUser: false,
        },
      });
      if (error) {
        const type = classifyAuthError(error, "send");
        if (type === "email_rate_limit") cooldown(RATE_LIMIT_COOLDOWN_MS);
        return message(authMessages[type]);
      }
      message(
        "登录邮件已发送。请在同一浏览器打开默认 Magic Link；登录后到账号安全设置密码。无需修改邮件模板。",
      );
    } catch {
      message(authMessages.network);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function verify() {
    if (lock.current) return;
    if (!supabase || invalidConfig) return message(authMessages.unconfigured);
    if (mismatch) return message(authMessages.wrong_origin);
    const token = otp.replace(/\s/g, "");
    if (!validEmail || !/^\d{6,10}$/.test(token))
      return message("请输入有效邮箱及邮件中的 6～10 位数字验证码");
    lock.current = true;
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token,
        type: "email",
      });
      if (error)
        return message(authMessages[classifyAuthError(error, "verify")]);
      if (!data.session?.access_token)
        return message(authMessages.verification_failed);
      setOtp("");
      message("登录成功。项目数据不会自动上传或覆盖。");
      onSuccess?.();
    } catch {
      message(authMessages.network);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function passwordLogin() {
    if (lock.current) return;
    if (!supabase || invalidConfig) return message(authMessages.unconfigured);
    if (mismatch) return message(authMessages.wrong_origin);
    if (!validEmail || !password) return message("请输入邮箱和密码");
    lock.current = true;
    setBusy(true);
    try {
      const result = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (result.error)
        return message(passwordError(result.error, "login").message);
      if (!result.data.session?.access_token)
        return message("登录未完成，请重试");
      message("登录成功。项目数据不会自动上传或覆盖。");
      onSuccess?.();
    } catch {
      message(authMessages.network);
    } finally {
      setPassword("");
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      className="editor-fields auth-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (mode === "password") void passwordLogin();
        else void verify();
      }}
    >
      <div className="tabs">
        <button
          type="button"
          className={mode === "password" ? "selected" : ""}
          disabled={busy}
          onClick={() => {
            setMode("password");
            setStatus("");
          }}
        >
          邮箱＋密码
        </button>
        <button
          type="button"
          className={mode === "magic" ? "selected" : ""}
          disabled={busy}
          onClick={() => {
            setMode("magic");
            setPassword("");
            setStatus("");
          }}
        >
          Magic Link 备用
        </button>
      </div>
      <p className="help">
        {mode === "password"
          ? "日常使用邮箱＋密码，不发送登录邮件。首次设置或忘记密码，请先用 Magic Link 登录，再到账号安全设置密码。"
          : "保留 Supabase 默认 Magic Link，免费使用，无需自定义 SMTP 或修改邮件模板。请在发起登录的同一浏览器、同一网站打开邮件链接。"}
      </p>
      {reason && (
        <p role="alert" className="auth-error">
          {authMessages[authReason(reason)]}
        </p>
      )}
      {(!supabase || invalidConfig) && (
        <p className="auth-error">{authMessages.unconfigured}</p>
      )}
      {mismatch && !invalidConfig && (
        <p className="auth-error">
          {authMessages.wrong_origin}{" "}
          <a href={`${site}/auth/login`}>打开正式登录站点</a>
        </p>
      )}
      <label>
        邮箱
        <input
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={busy}
        />
      </label>
      {mode === "password" ? (
        <>
          <label>
            密码
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          <button
            type="submit"
            className="primary"
            disabled={
              !supabase ||
              !origin ||
              busy ||
              !validEmail ||
              !password ||
              mismatch ||
              invalidConfig
            }
          >
            密码登录
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="secondary"
            disabled={
              !supabase ||
              !origin ||
              busy ||
              !validEmail ||
              remaining > 0 ||
              mismatch ||
              invalidConfig
            }
            onClick={() => void send()}
          >
            发送登录邮件
          </button>
          {remaining > 0 && (
            <p className="help" role="timer">
              {remaining} 秒后可手动尝试重发；冷却结束不代表服务商配额已恢复。
            </p>
          )}
          <details className="auth-optional">
            <summary>邮件中已有验证码？</summary>
            <label>
              邮箱验证码
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="输入最新邮件中的验证码"
                maxLength={12}
                disabled={busy}
              />
            </label>
            <button
              type="submit"
              className="primary"
              disabled={
                !supabase ||
                !origin ||
                busy ||
                !validEmail ||
                !/^\d{6,10}$/.test(otp.replace(/\s/g, "")) ||
                mismatch ||
                invalidConfig
              }
            >
              验证并登录
            </button>
          </details>
        </>
      )}
      {status && (
        <p className="auth-message" role="status">
          {status}
        </p>
      )}
      <p className="help">
        Magic Link
        仍受免费发信配额限制，不会自动重发；默认邮件没有数字验证码也可正常使用链接。设置密码后，日常登录不依赖邮件。
      </p>
    </form>
  );
}
