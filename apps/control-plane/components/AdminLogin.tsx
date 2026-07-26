"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  LanguageSwitch,
  useLanguage,
} from "@/app/i18n";

const COPY = {
  en: {
    title: "Owner sign in",
    description:
      "This surface changes the configuration for every CAPTCHA. The session is stored only in a protected HttpOnly cookie.",
    password: "CONTROL PLANE PASSWORD",
    checking: "CHECKING…",
    signIn: "SIGN IN →",
    back: "← Back to CAPTCHA",
    error: "Unable to sign in",
  },
  ru: {
    title: "Вход владельца",
    description:
      "Здесь меняется конфигурация всех CAPTCHA. Сессия хранится только в защищённой HttpOnly cookie.",
    password: "ПАРОЛЬ CONTROL PLANE",
    checking: "ПРОВЕРЯЕМ…",
    signIn: "ВОЙТИ →",
    back: "← Вернуться к CAPTCHA",
    error: "Не удалось войти",
  },
} as const;

export function AdminLogin() {
  const { locale } = useLanguage();
  const copy = COPY[locale];
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      await response.json();
      if (!response.ok) throw new Error(copy.error);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : copy.error,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="admin-login-page">
      <div className="admin-login-top">
        <Link className="brand" href="/" aria-label="WHOIZE CAPTCHA">
          WHOIZE<span>/</span>CONTROL PLANE
        </Link>
        <LanguageSwitch />
      </div>
      <section className="admin-login-card">
        <p className="admin-eyebrow">SERVER OWNER SURFACE · RESTRICTED</p>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
        <form onSubmit={submit}>
          <label>
            <span>{copy.password}</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
              required
            />
          </label>
          {error && <div className="admin-login-error">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? copy.checking : copy.signIn}
          </button>
        </form>
        <Link className="admin-login-back" href="/">
          {copy.back}
        </Link>
      </section>
      <p className="admin-login-foot">
        WHOIZE · AUTHENTICATED SERVER CONFIGURATION
      </p>
    </main>
  );
}
