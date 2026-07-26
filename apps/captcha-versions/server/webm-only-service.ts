import type { CaptchaConfig } from "@whoize/captcha-core";
import {
  generateChallengeScene,
  isChallengeHit,
  type ChallengeScene,
} from "../../server-captcha/server/challenge-engine.ts";
import {
  readRecord,
  RecordConflictError,
  writeRecord,
} from "../../server-captcha/server/state-store.ts";
import { createOpaqueToken } from "../../server-captcha/server/session.ts";
import { issueProof } from "../../server-captcha/server/challenge-service.ts";

const SHAPE_SLUG = {
  Круг: "circle",
  Треугольник: "triangle",
  Ромб: "diamond",
  Звезда: "star",
} as const;

export type WebmOnlyChallengeRecord = {
  id: string;
  scene: ChallengeScene;
  sessionHash: string;
  expiresAt: number;
  maxAttempts: number;
  attempts: number;
  used: boolean;
  proofToken: string | null;
};

function challengeKey(id: string) {
  return `webm-v14/challenges/${id}`;
}

export function webmOnlyPublicChallenge(record: WebmOnlyChallengeRecord) {
  return {
    id: record.id,
    shape: SHAPE_SLUG[record.scene.shape],
    width: record.scene.width,
    height: record.scene.height,
    fps: record.scene.fps,
    frameCount: record.scene.durationFrames,
    segmentDurationMs:
      (record.scene.segmentFrames / record.scene.fps) * 1000,
    segmentCount: Math.ceil(
      record.scene.durationFrames / record.scene.segmentFrames,
    ),
    expiresAt: record.expiresAt,
    maxAttempts: record.maxAttempts,
    transport: "webm-only" as const,
    codec: "vp8" as const,
  };
}

export async function createWebmOnlyChallenge({
  config,
  sessionHash,
  now = Date.now(),
}: {
  config: CaptchaConfig;
  sessionHash: string;
  now?: number;
}) {
  const id = createOpaqueToken("webm14");
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const scene = generateChallengeScene(config, seed);
  const expiresAt = now + config.durationSeconds * 1000;
  const record: WebmOnlyChallengeRecord = {
    id,
    scene,
    sessionHash,
    expiresAt,
    maxAttempts: config.maxAttempts,
    attempts: 0,
    used: false,
    proofToken: null,
  };
  await writeRecord({ key: challengeKey(id), value: record, expiresAt });
  return { record };
}

export type ReadWebmOnlyChallengeResult =
  | { success: true; record: WebmOnlyChallengeRecord }
  | {
      success: false;
      reason: "not_found" | "expired" | "session" | "used" | "invalid";
    };

export async function readWebmOnlySegment({
  id,
  sessionHash,
  segmentIndex,
  now = Date.now(),
}: {
  id: string;
  sessionHash: string;
  segmentIndex: number;
  now?: number;
}): Promise<ReadWebmOnlyChallengeResult> {
  const stored = await readRecord<WebmOnlyChallengeRecord>(
    challengeKey(id),
    Number.NEGATIVE_INFINITY,
  );
  if (!stored) return { success: false, reason: "not_found" };
  const challenge = stored.value;
  if (challenge.sessionHash !== sessionHash) {
    return { success: false, reason: "session" };
  }
  if (challenge.expiresAt <= now) {
    return { success: false, reason: "expired" };
  }
  if (challenge.used) return { success: false, reason: "used" };
  const segmentCount = Math.ceil(
    challenge.scene.durationFrames / challenge.scene.segmentFrames,
  );
  if (
    !Number.isInteger(segmentIndex) ||
    segmentIndex < 0 ||
    segmentIndex >= segmentCount
  ) {
    return { success: false, reason: "invalid" };
  }
  return { success: true, record: challenge };
}

export async function verifyWebmOnlyChallenge({
  id,
  sessionHash,
  x,
  y,
  frameIndex,
  proofTtlSeconds,
  now = Date.now(),
}: {
  id: string;
  sessionHash: string;
  x: number;
  y: number;
  frameIndex: number;
  proofTtlSeconds: number;
  now?: number;
}) {
  for (let retry = 0; retry < 3; retry += 1) {
    const stored = await readRecord<WebmOnlyChallengeRecord>(
      challengeKey(id),
      Number.NEGATIVE_INFINITY,
    );
    if (!stored) return { success: false, reason: "not_found" as const };
    const challenge = stored.value;
    const attemptsRemaining = Math.max(
      0,
      challenge.maxAttempts - challenge.attempts,
    );
    if (challenge.sessionHash !== sessionHash) {
      return {
        success: false,
        reason: "session" as const,
        attemptsRemaining: 0,
      };
    }
    if (challenge.expiresAt <= now) {
      return {
        success: false,
        reason: "expired" as const,
        attemptsRemaining,
      };
    }
    if (challenge.used) {
      return {
        success: false,
        reason: "used" as const,
        attemptsRemaining: 0,
      };
    }
    if (challenge.attempts >= challenge.maxAttempts) {
      return {
        success: false,
        reason: "locked" as const,
        attemptsRemaining: 0,
      };
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
      frameIndex >= challenge.scene.durationFrames
    ) {
      return {
        success: false,
        reason: "invalid" as const,
        attemptsRemaining,
      };
    }

    const hit = isChallengeHit({
      scene: challenge.scene,
      frameIndex,
      x,
      y,
    });
    const next: WebmOnlyChallengeRecord = {
      ...challenge,
      attempts: challenge.attempts + 1,
      used: hit,
      proofToken: null,
    };
    const proof = hit
      ? await issueProof({
          challengeId: challenge.id,
          challengeRecordKey: challengeKey(challenge.id),
          sessionHash,
          proofTtlSeconds,
          now,
        })
      : null;
    if (proof) next.proofToken = proof.token;

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

    return proof
      ? {
          success: true,
          reason: "passed" as const,
          proofToken: proof.token,
          proofExpiresAt: proof.expiresAt,
          attemptsRemaining: Math.max(
            0,
            next.maxAttempts - next.attempts,
          ),
        }
      : {
          success: false,
          reason:
            next.attempts >= next.maxAttempts
              ? ("locked" as const)
              : ("miss" as const),
          attemptsRemaining: Math.max(
            0,
            next.maxAttempts - next.attempts,
          ),
        };
  }
  return {
    success: false,
    reason: "used" as const,
    attemptsRemaining: 0,
  };
}
