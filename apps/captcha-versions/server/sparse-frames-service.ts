import type { CaptchaConfig } from "@whoize/captcha-core";
import {
  encodeSparseFrames,
  generateSparseScene,
  isSparseHit,
  type SparseScene,
} from "./sparse-frames-engine.ts";
import {
  readRecord,
  RecordConflictError,
  writeRecord,
} from "../../server-captcha/server/state-store.ts";
import { createOpaqueToken } from "../../server-captcha/server/session.ts";

export type SparseChallengeRecord = {
  id: string;
  scene: SparseScene;
  sessionHash: string;
  expiresAt: number;
  maxAttempts: number;
  attempts: number;
  used: boolean;
};

function challengeKey(id: string) {
  return `sparse-frames/challenges/${id}`;
}

export async function createSparseFramesChallenge({
  config,
  sessionHash,
  now = Date.now(),
}: {
  config: CaptchaConfig;
  sessionHash: string;
  now?: number;
}) {
  const id = createOpaqueToken("sparse");
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const scene = generateSparseScene(config, seed);
  const expiresAt = now + config.durationSeconds * 1000;
  const record: SparseChallengeRecord = {
    id,
    scene,
    sessionHash,
    expiresAt,
    maxAttempts: config.maxAttempts,
    attempts: 0,
    used: false,
  };
  await writeRecord({ key: challengeKey(id), value: record, expiresAt });
  return { record, payload: encodeSparseFrames(scene) };
}

export async function verifySparseFramesChallenge({
  id,
  sessionHash,
  x,
  y,
  frameIndex,
  now = Date.now(),
}: {
  id: string;
  sessionHash: string;
  x: number;
  y: number;
  frameIndex: number;
  now?: number;
}) {
  for (let retry = 0; retry < 3; retry += 1) {
    const stored = await readRecord<SparseChallengeRecord>(
      challengeKey(id),
      Number.NEGATIVE_INFINITY,
    );
    if (!stored) return { success: false, reason: "not_found" as const };
    const challenge = stored.value;
    if (challenge.sessionHash !== sessionHash) {
      return { success: false, reason: "session" as const };
    }
    if (challenge.expiresAt <= now) {
      return { success: false, reason: "expired" as const };
    }
    if (challenge.used) return { success: false, reason: "used" as const };
    if (challenge.attempts >= challenge.maxAttempts) {
      return { success: false, reason: "locked" as const };
    }
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isInteger(frameIndex) ||
      x < 0 ||
      y < 0 ||
      x > challenge.scene.width ||
      y > challenge.scene.height ||
      frameIndex < 0 ||
      frameIndex >= challenge.scene.frameCount
    ) {
      return { success: false, reason: "invalid" as const };
    }
    const hit = isSparseHit({
      scene: challenge.scene,
      frameIndex,
      x,
      y,
    });
    const next = {
      ...challenge,
      attempts: challenge.attempts + 1,
      used: hit,
    };
    try {
      await writeRecord({
        key: challengeKey(id),
        value: next,
        expiresAt: challenge.expiresAt,
        expectedVersion: stored.version,
      });
    } catch (error) {
      if (error instanceof RecordConflictError) continue;
      throw error;
    }
    return {
      success: hit,
      reason: hit
        ? ("passed" as const)
        : next.attempts >= next.maxAttempts
          ? ("locked" as const)
          : ("miss" as const),
      attemptsRemaining: Math.max(0, next.maxAttempts - next.attempts),
    };
  }
  return { success: false, reason: "used" as const };
}
