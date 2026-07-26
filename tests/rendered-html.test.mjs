import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the WHOIZE CAPTCHA demo shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="ru">/i);
  assert.match(html, /<title>Motion CAPTCHA · WHOIZE<\/title>/i);
  assert.match(html, /WHOIZE/);
  assert.match(html, /CAPTCHA/);
  assert.match(html, /Докажите, что/);
  assert.match(html, /Запросить ранний доступ/);
  assert.match(html, /Продолжить с WHOIZE/);
  assert.match(html, />Admin</);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("server-renders the separate motion lab route", async () => {
  const response = await render("/lab");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /<title>Motion Lab · WHOIZE<\/title>/i);
  assert.match(html, /WHOIZE/);
  assert.match(html, /MOTION LAB/);
  assert.match(html, /Фигура существует/);
  assert.match(html, /Найдите движущуюся фигуру/);
});

test("server-renders the protected owner login", async () => {
  const response = await render("/admin");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /<title>Control Plane · WHOIZE<\/title>/i);
  assert.match(html, /WHOIZE/);
  assert.match(html, /CONTROL PLANE/);
  assert.match(html, /Вход владельца/);
  assert.match(html, /ПАРОЛЬ CONTROL PLANE/);
  assert.doesNotMatch(html, /SERVER CONFIG ONLINE/);
});

test("serves the public read-only CAPTCHA config", async () => {
  const response = await render("/api/captcha-config");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/i);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/i);

  const payload = await response.json();
  assert.equal(payload.config.schemaVersion, 1);
  assert.ok(payload.config.revision >= 1);
  assert.deepEqual(payload.config.shapes, [
    "Круг",
    "Треугольник",
    "Ромб",
    "Звезда",
  ]);
});

test("rejects unauthenticated Control Plane API access", async () => {
  const response = await render("/api/admin/config");
  assert.equal(response.status, 401);

  const payload = await response.json();
  assert.match(payload.error, /вход владельца/i);
});
