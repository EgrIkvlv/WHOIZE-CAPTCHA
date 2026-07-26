import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CAPTCHA_CONFIG } from "../packages/captcha-core/src/index.ts";
import {
  createServerChallenge,
  redeemProof,
  verifyServerChallenge,
} from "../apps/server-captcha/server/challenge-service.ts";
import { readRecord } from "../apps/server-captcha/server/state-store.ts";

function resetStore() {
  globalThis.__whoizeCaptchaRecords = new Map();
}

test("creates an opaque pixel challenge and verifies the private answer", async () => {
  resetStore();
  const now = 1_800_000_000_000;
  const sessionHash = "session-a";
  const { record, image } = await createServerChallenge({
    config: DEFAULT_CAPTCHA_CONFIG,
    sessionHash,
    now,
  });

  assert.deepEqual(Array.from(image.subarray(0, 8)), [
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
  assert.ok(image.length > 100_000);
  assert.match(new TextDecoder().decode(image), /acTL/);
  assert.match(record.id, /^ch_[a-f0-9]{48}$/);
  assert.equal(record.positions.length, record.fps * 3);

  const privateRecord = await readRecord(
    `challenges/${record.id}`,
    Number.NEGATIVE_INFINITY,
  );
  assert.ok(privateRecord);
  const center = privateRecord.value.positions[0];
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
    x: record.positions[0].x,
    y: record.positions[0].y,
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
  const center = record.positions[3];
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
    x: record.positions[0].x,
    y: record.positions[0].y,
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
    x: fresh.record.positions[0].x,
    y: fresh.record.positions[0].y,
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
