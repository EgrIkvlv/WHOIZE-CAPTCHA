"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminLogin() {
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
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось войти");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Не удалось войти",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="admin-login-page">
      <Link className="brand" href="/" aria-label="WHOIZE CAPTCHA">
        WHOIZE<span>/</span>CONTROL PLANE
      </Link>
      <section className="admin-login-card">
        <p className="admin-eyebrow">SERVER OWNER SURFACE · RESTRICTED</p>
        <h1>Вход владельца</h1>
        <p>
          Здесь меняется конфигурация всех CAPTCHA. Сессия хранится только в
          защищённой HttpOnly cookie.
        </p>
        <form onSubmit={submit}>
          <label>
            <span>ПАРОЛЬ CONTROL PLANE</span>
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
            {loading ? "ПРОВЕРЯЕМ…" : "ВОЙТИ →"}
          </button>
        </form>
        <Link className="admin-login-back" href="/">
          ← Вернуться к CAPTCHA
        </Link>
      </section>
      <p className="admin-login-foot">
        WHOIZE · AUTHENTICATED SERVER CONFIGURATION
      </p>
    </main>
  );
}
