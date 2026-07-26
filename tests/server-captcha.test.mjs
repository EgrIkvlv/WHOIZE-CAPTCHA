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
import {
  createLegacyApngChallenge,
  verifyLegacyApngChallenge,
} from "../apps/captcha-versions/server/legacy-apng-service.ts";
import {
  decodeSparseFrames,
  SPARSE_LOOP_SECONDS,
} from "../apps/captcha-versions/server/sparse-frames-engine.ts";
import {
  createSparseFramesChallenge,
  verifySparseFramesChallenge,
} from "../apps/captcha-versions/server/sparse-frames-service.ts";
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

test("preserves the legacy APNG build as a runnable server challenge", async () => {
  resetStore();
  const now = 1_800_000_000_000;
  const { record, image } = await createLegacyApngChallenge({
    config: DEFAULT_CAPTCHA_CONFIG,
    sessionHash: "session-a",
    now,
  });
  assert.deepEqual(Array.from(image.subarray(0, 8)), [
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
  assert.equal(record.width, 384);
  assert.equal(record.height, 216);
  assert.equal(record.fps, 16);
  assert.equal(record.positions.length, 48);
  assert.equal(record.effectiveDensity, 2_592);
  assert.equal(record.effectiveDotSize, 1.44);
  assert.ok(image.byteLength > 200_000);
  assert.ok(image.byteLength < 1_000_000);

  const result = await verifyLegacyApngChallenge({
    id: record.id,
    sessionHash: "session-a",
    x: record.positions[0].x,
    y: record.positions[0].y,
    frameIndex: 0,
    now: now + 500,
  });
  assert.equal(result.success, true);
});

test("encodes full-quality v1.3a sparse frames and verifies the private path", async () => {
  resetStore();
  const now = 1_800_000_000_000;
  const sessionHash = "session-a";
  const { record, payload } = await createSparseFramesChallenge({
    config: DEFAULT_CAPTCHA_CONFIG,
    sessionHash,
    now,
  });
  const decoded = decodeSparseFrames(payload);

  assert.match(record.id, /^sparse_[a-f0-9]{48}$/);
  assert.equal(decoded.width, 640);
  assert.equal(decoded.height, 360);
  assert.equal(decoded.fps, 48);
  assert.equal(decoded.frameCount, 48 * SPARSE_LOOP_SECONDS);
  assert.equal(decoded.density, 7_200);
  assert.equal(decoded.dotSize, 2.4);
  assert.equal(decoded.loop, true);
  assert.equal(decoded.frames.length, 192);
  assert.ok(decoded.frames.every((frame) => frame.length === 7_200));
  assert.ok(payload.byteLength > 800_000);
  assert.ok(payload.byteLength < 2_000_000);
  assert.notDeepEqual(decoded.frames[0], decoded.frames[1]);

  const first = record.scene.positions[0];
  const last = record.scene.positions.at(-1);
  assert.ok(Math.hypot(first.x - last.x, first.y - last.y) < 4);

  const result = await verifySparseFramesChallenge({
    id: record.id,
    sessionHash,
    x: first.x,
    y: first.y,
    frameIndex: 0,
    now: now + 1_000,
  });
  assert.equal(result.success, true);
  assert.deepEqual(result.reveal, {
    centerX: first.x,
    centerY: first.y,
    radius: record.scene.radius,
    frameIndex: 0,
  });

  const missChallenge = await createSparseFramesChallenge({
    config: DEFAULT_CAPTCHA_CONFIG,
    sessionHash,
    now,
  });
  const miss = await verifySparseFramesChallenge({
    id: missChallenge.record.id,
    sessionHash,
    x: 0,
    y: 0,
    frameIndex: 0,
    now: now + 1_000,
  });
  assert.equal(miss.success, false);
  assert.equal(miss.reveal, undefined);
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
