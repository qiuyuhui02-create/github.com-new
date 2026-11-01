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
}: {
  reason?: AuthReason;
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
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (error) {
        const type = classifyAuthError(error, "send");
        if (type === "email_rate_limit") cooldown(RATE_LIMIT_COOLDOWN_MS);
        return message(authMessages[type]);
      }
      message(
        "登录邮件已发送。推荐输入邮件验证码；也可打开邮件链接后点击确认。只使用最新一封邮件。",
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
  return (
    <form
      className="editor-fields auth-form"
      onSubmit={(e) => {
        e.preventDefault();
        void verify();
      }}
    >
      <p className="help">
        邮箱验证码优先：跨设备或不同浏览器也可验证，无需原来的 PKCE
        Cookie。不会自动发送或重发邮件。
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
      {status && (
        <p className="auth-message" role="status">
          {status}
        </p>
      )}
      <p className="help">
        邮件中的链接和验证码共用一次性令牌，验证成功后不要重复使用。若此前已经限流，请停止连续发送并查看后台限额。
      </p>
    </form>
  );
}
