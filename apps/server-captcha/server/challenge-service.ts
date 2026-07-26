import type { CaptchaConfig, ShapeName } from "@whoize/captcha-core";
import {
  generateChallengeScene,
  isChallengeHit,
  type Point,
} from "./challenge-engine.ts";
import {
  readRecord,
  RecordConflictError,
  writeRecord,
} from "./state-store.ts";
import { createOpaqueToken } from "./session.ts";

const ACTION = "demo-signup";

export type ChallengeRecord = {
  id: string;
  shape: ShapeName;
  radius: number;
  width: number;
  height: number;
  fps: number;
  positions: Point[];
  sessionHash: string;
  action: typeof ACTION;
  expiresAt: number;
  maxAttempts: number;
  attempts: number;
  used: boolean;
  proofToken: string | null;
};

type ProofRecord = {
  token: string;
  challengeId: string;
  sessionHash: string;
  action: typeof ACTION;
  expiresAt: number;
  used: boolean;
};

function challengeKey(id: string) {
  return `challenges/${id}`;
}

function proofKey(token: string) {
  return `proofs/${token}`;
}

export async function createServerChallenge({
  config,
  sessionHash,
  now = Date.now(),
}: {
  config: CaptchaConfig;
  sessionHash: string;
  now?: number;
}) {
  const id = createOpaqueToken("ch");
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const scene = await generateChallengeScene(config, seed);
  const expiresAt = now + config.durationSeconds * 1000;
  const record: ChallengeRecord = {
    id,
    shape: scene.shape,
    radius: scene.radius,
    width: scene.width,
    height: scene.height,
    fps: scene.fps,
    positions: scene.positions,
    sessionHash,
    action: ACTION,
    expiresAt,
    maxAttempts: config.maxAttempts,
    attempts: 0,
    used: false,
    proofToken: null,
  };
  await writeRecord({
    key: challengeKey(id),
    value: record,
    expiresAt,
  });
  return { record, image: scene.image };
}

export type VerifyResult =
  | {
      success: true;
      proofToken: string;
      proofExpiresAt: number;
    }
  | {
      success: false;
      reason:
        | "not_found"
        | "expired"
        | "session"
        | "used"
        | "locked"
        | "invalid"
        | "miss";
      attemptsRemaining: number;
    };

export async function verifyServerChallenge({
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
}): Promise<VerifyResult> {
  for (let retry = 0; retry < 3; retry += 1) {
    const stored = await readRecord<ChallengeRecord>(
      challengeKey(id),
      Number.NEGATIVE_INFINITY,
    );
    if (!stored) {
      return { success: false, reason: "not_found", attemptsRemaining: 0 };
    }
    const challenge = stored.value;
    const remaining = Math.max(
      0,
      challenge.maxAttempts - challenge.attempts,
    );
    if (challenge.sessionHash !== sessionHash) {
      return { success: false, reason: "session", attemptsRemaining: 0 };
    }
    if (challenge.expiresAt <= now) {
      return { success: false, reason: "expired", attemptsRemaining: remaining };
    }
    if (challenge.used) {
      return { success: false, reason: "used", attemptsRemaining: 0 };
    }
    if (challenge.attempts >= challenge.maxAttempts) {
      return { success: false, reason: "locked", attemptsRemaining: 0 };
    }
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isInteger(frameIndex) ||
      x < 0 ||
      y < 0 ||
      x > challenge.width ||
      y > challenge.height ||
      frameIndex < 0 ||
      frameIndex >= challenge.positions.length
    ) {
      return { success: false, reason: "invalid", attemptsRemaining: remaining };
    }

    const hit = isChallengeHit({
      shape: challenge.shape,
      radius: challenge.radius,
      positions: challenge.positions,
      frameIndex,
      x,
      y,
    });
    const nextChallenge: ChallengeRecord = {
      ...challenge,
      attempts: challenge.attempts + 1,
    };

    let proof: ProofRecord | null = null;
    if (hit) {
      const proofToken = createOpaqueToken("proof");
      const proofExpiresAt = now + proofTtlSeconds * 1000;
      proof = {
        token: proofToken,
        challengeId: challenge.id,
        sessionHash,
        action: ACTION,
        expiresAt: proofExpiresAt,
        used: false,
      };
      await writeRecord({
        key: proofKey(proofToken),
        value: proof,
        expiresAt: proofExpiresAt,
      });
      nextChallenge.used = true;
      nextChallenge.proofToken = proofToken;
    }

    try {
      await writeRecord({
        key: challengeKey(id),
        value: nextChallenge,
        expiresAt: challenge.expiresAt,
        expectedVersion: stored.version,
      });
    } catch (error) {
      if (error instanceof RecordConflictError) continue;
      throw error;
    }

    if (proof) {
      return {
        success: true,
        proofToken: proof.token,
        proofExpiresAt: proof.expiresAt,
      };
    }
    const attemptsRemaining = Math.max(
      0,
      challenge.maxAttempts - nextChallenge.attempts,
    );
    return {
      success: false,
      reason: attemptsRemaining ? "miss" : "locked",
      attemptsRemaining,
    };
  }

  return { success: false, reason: "used", attemptsRemaining: 0 };
}

export type RedeemResult =
  | { success: true }
  | {
      success: false;
      reason:
        | "not_found"
        | "expired"
        | "session"
        | "action"
        | "used"
        | "orphaned";
    };

export async function redeemProof({
  token,
  sessionHash,
  action = ACTION,
  now = Date.now(),
}: {
  token: string;
  sessionHash: string;
  action?: string;
  now?: number;
}): Promise<RedeemResult> {
  for (let retry = 0; retry < 3; retry += 1) {
    const stored = await readRecord<ProofRecord>(
      proofKey(token),
      Number.NEGATIVE_INFINITY,
    );
    if (!stored) return { success: false, reason: "not_found" };
    const proof = stored.value;
    if (proof.expiresAt <= now) return { success: false, reason: "expired" };
    if (proof.sessionHash !== sessionHash) {
      return { success: false, reason: "session" };
    }
    if (proof.action !== action) return { success: false, reason: "action" };
    if (proof.used) return { success: false, reason: "used" };

    const challenge = await readRecord<ChallengeRecord>(
      challengeKey(proof.challengeId),
      Number.NEGATIVE_INFINITY,
    );
    if (
      !challenge ||
      challenge.value.proofToken !== token ||
      !challenge.value.used
    ) {
      return { success: false, reason: "orphaned" };
    }

    try {
      await writeRecord({
        key: proofKey(token),
        value: { ...proof, used: true },
        expiresAt: proof.expiresAt,
        expectedVersion: stored.version,
      });
      return { success: true };
    } catch (error) {
      if (error instanceof RecordConflictError) continue;
      throw error;
    }
  }
  return { success: false, reason: "used" };
}
