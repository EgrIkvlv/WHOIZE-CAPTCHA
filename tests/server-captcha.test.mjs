import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_CAPTCHA_CONFIG } from "../packages/captcha-core/src/index.ts";
import {
  positionAtFrame,
  renderChallengeSegment,
} from "../apps/server-captcha/server/challenge-engine.ts";
import {
  createServerChallenge,
  readServerChallengeSegment,
  redeemProof,
  verifyServerChallenge,
} from "../apps/server-captcha/server/challenge-service.ts";
import { readRecord } from "../apps/server-captcha/server/state-store.ts";

function resetStore() {
  globalThis.__whoizeCaptchaRecords = new Map();
}

test("creates an opaque video challenge and verifies the private answer", async () => {
  resetStore();
  const now = 1_800_000_000_000;
  const sessionHash = "session-a";
  const { record } = await createServerChallenge({
    config: DEFAULT_CAPTCHA_CONFIG,
    sessionHash,
    now,
  });

  assert.match(record.id, /^ch_[a-f0-9]{48}$/);
  assert.equal(record.scene.width, 640);
  assert.equal(record.scene.height, 360);
  assert.equal(record.scene.fps, 48);
  assert.equal(record.scene.density, 7_200);
  assert.equal(record.scene.segmentFrames, 48);

  const privateRecord = await readRecord(
    `challenges/${record.id}`,
    Number.NEGATIVE_INFINITY,
  );
  assert.ok(privateRecord);
  const center = positionAtFrame(privateRecord.value.scene, 0);
  const result = await verifyServerChallenge({
    id: record.id,
    sessionHash,
    x: center.x,
    y: center.y,
    frameIndex: 0,
    proofTtlSeconds: 60,
    now: now + 1_000,
  });

  assert.equal(result.success, true);
  assert.match(result.proofToken, /^proof_[a-f0-9]{48}$/);
});

test("renders a valid one-second VP8 WebM segment", async () => {
  resetStore();
  const { record } = await createServerChallenge({
    config: DEFAULT_CAPTCHA_CONFIG,
    sessionHash: "session-a",
  });
  const wasmBinary = await readFile(
    new URL("../public/codecs/webm-wasm.wasm", import.meta.url),
  );
  const segment = await renderChallengeSegment({
    scene: record.scene,
    segmentIndex: 0,
    wasmBinary: wasmBinary.buffer.slice(
      wasmBinary.byteOffset,
      wasmBinary.byteOffset + wasmBinary.byteLength,
    ),
  });

  assert.deepEqual(Array.from(segment.subarray(0, 4)), [0x1a, 0x45, 0xdf, 0xa3]);
  assert.ok(segment.length > 50_000);
  assert.ok(segment.length < 1_000_000);
});

test("binds video segments to the challenge session", async () => {
  resetStore();
  const { record } = await createServerChallenge({
    config: DEFAULT_CAPTCHA_CONFIG,
    sessionHash: "session-a",
  });
  assert.equal(
    (
      await readServerChallengeSegment({
        id: record.id,
        sessionHash: "session-a",
        segmentIndex: 1,
      })
    ).success,
    true,
  );
  assert.deepEqual(
    await readServerChallengeSegment({
      id: record.id,
      sessionHash: "session-b",
      segmentIndex: 1,
    }),
    { success: false, reason: "session" },
  );
});

test("binds a challenge to its session and enforces attempt limits", async () => {
  resetStore();
  const now = 1_800_000_000_000;
  const config = { ...DEFAULT_CAPTCHA_CONFIG, maxAttempts: 1 };
  const { record } = await createServerChallenge({
    config,
    sessionHash: "session-a",
    now,
  });

  const wrongSession = await verifyServerChallenge({
    id: record.id,
    sessionHash: "session-b",
    x: 0,
    y: 0,
    frameIndex: 0,
    proofTtlSeconds: 60,
    now: now + 1_000,
  });
  assert.deepEqual(wrongSession, {
    success: false,
    reason: "session",
    attemptsRemaining: 0,
  });

  const miss = await verifyServerChallenge({
    id: record.id,
    sessionHash: "session-a",
    x: 0,
    y: 0,
    frameIndex: 0,
    proofTtlSeconds: 60,
    now: now + 1_000,
  });
  assert.deepEqual(miss, {
    success: false,
    reason: "locked",
    attemptsRemaining: 0,
  });

  const locked = await verifyServerChallenge({
    id: record.id,
    sessionHash: "session-a",
    x: positionAtFrame(record.scene, 0).x,
    y: positionAtFrame(record.scene, 0).y,
    frameIndex: 0,
    proofTtlSeconds: 60,
    now: now + 1_100,
  });
  assert.equal(locked.success, false);
  assert.equal(locked.reason, "locked");
});

test("consumes a proof once and rejects replay", async () => {
  resetStore();
  const now = 1_800_000_000_000;
  const sessionHash = "session-a";
  const { record } = await createServerChallenge({
    config: DEFAULT_CAPTCHA_CONFIG,
    sessionHash,
    now,
  });
  const center = positionAtFrame(record.scene, 3);
  const verified = await verifyServerChallenge({
    id: record.id,
    sessionHash,
    x: center.x,
    y: center.y,
    frameIndex: 3,
    proofTtlSeconds: 60,
    now: now + 1_000,
  });
  assert.equal(verified.success, true);

  const first = await redeemProof({
    token: verified.proofToken,
    sessionHash,
    action: "demo-signup",
    now: now + 2_000,
  });
  assert.deepEqual(first, { success: true });

  const replay = await redeemProof({
    token: verified.proofToken,
    sessionHash,
    action: "demo-signup",
    now: now + 2_100,
  });
  assert.deepEqual(replay, { success: false, reason: "used" });
});

test("rejects expired challenges and proofs", async () => {
  resetStore();
  const now = 1_800_000_000_000;
  const config = {
    ...DEFAULT_CAPTCHA_CONFIG,
    durationSeconds: 15,
    proofTtlSeconds: 15,
  };
  const { record } = await createServerChallenge({
    config,
    sessionHash: "session-a",
    now,
  });
  const expiredChallenge = await verifyServerChallenge({
    id: record.id,
    sessionHash: "session-a",
    x: positionAtFrame(record.scene, 0).x,
    y: positionAtFrame(record.scene, 0).y,
    frameIndex: 0,
    proofTtlSeconds: 15,
    now: now + 15_001,
  });
  assert.equal(expiredChallenge.success, false);
  assert.equal(expiredChallenge.reason, "expired");

  const fresh = await createServerChallenge({
    config,
    sessionHash: "session-a",
    now,
  });
  const verified = await verifyServerChallenge({
    id: fresh.record.id,
    sessionHash: "session-a",
    x: positionAtFrame(fresh.record.scene, 0).x,
    y: positionAtFrame(fresh.record.scene, 0).y,
    frameIndex: 0,
    proofTtlSeconds: 15,
    now: now + 1_000,
  });
  assert.equal(verified.success, true);
  const expiredProof = await redeemProof({
    token: verified.proofToken,
    sessionHash: "session-a",
    action: "demo-signup",
    now: verified.proofExpiresAt + 1,
  });
  assert.deepEqual(expiredProof, { success: false, reason: "expired" });
});
