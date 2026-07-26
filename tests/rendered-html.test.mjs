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
  assert.match(html, /<html lang="en">/i);
  assert.match(html, /<title>Motion CAPTCHA · WHOIZE<\/title>/i);
  assert.match(html, /WHOIZE/);
  assert.match(html, /CAPTCHA/);
  assert.match(html, /Prove that/);
  assert.match(html, /Request early access/);
  assert.match(html, /Continue with WHOIZE/);
  assert.match(html, />EN</);
  assert.match(html, />RU</);
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
  assert.match(html, /The figure exists/);
  assert.match(html, /Find the moving shape/);
  assert.match(html, /class="selected">Readable/);
  assert.match(html, /class="captcha-aim-cursor"/);
});

test("server-renders the runnable CAPTCHA versions archive", async () => {
  const response = await render("/versions");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /<title>CAPTCHA Versions · WHOIZE<\/title>/i);
  assert.match(html, /CAPTCHA/);
  assert.match(html, /Versions/);
  assert.match(html, /Client Canvas/);
  assert.match(html, /Server APNG/);
  assert.match(html, /Server WebM/);
  assert.match(html, /Sparse Frames/);
  assert.match(html, /v1\.3a/);
  assert.match(html, /Sparse \+ Browser Blur/);
  assert.match(html, /v1\.3b/);
  assert.match(html, /Dynamic WebM Only/);
  assert.match(html, /v1\.4/);
  assert.match(html, /Matched Motion Decoys/);
  assert.match(html, /v1\.5/);
  assert.match(html, /class="version-open"/);
  assert.match(html, />Open</);
});

test("server-renders the protected owner login", async () => {
  const response = await render("/admin");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /<title>Control Plane · WHOIZE<\/title>/i);
  assert.match(html, /WHOIZE/);
  assert.match(html, /CONTROL PLANE/);
  assert.match(html, /Owner sign in/);
  assert.match(html, /CONTROL PLANE PASSWORD/);
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
  assert.match(payload.error, /owner sign-in required/i);
});
