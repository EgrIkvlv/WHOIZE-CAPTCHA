import type { CaptchaConfig } from "@whoize/captcha-core";
import {
  createWebmOnlyChallenge,
  readWebmOnlySegment,
  verifyWebmOnlyChallenge,
  webmOnlyPublicChallenge,
  type WebmOnlyChallengeRecord,
} from "./webm-only-service.ts";

const NAMESPACE = "webm-v16";

export async function createRegenerativeMotionChallenge({
  config,
  sessionHash,
  now = Date.now(),
}: {
  config: CaptchaConfig;
  sessionHash: string;
  now?: number;
}) {
  return createWebmOnlyChallenge({
    config,
    sessionHash,
    namespace: NAMESPACE,
    tokenPrefix: "webm16",
    now,
  });
}

export function regenerativeMotionPublicChallenge(
  record: WebmOnlyChallengeRecord,
) {
  return {
    ...webmOnlyPublicChallenge(record),
    variant: "regenerative-motion" as const,
  };
}

export async function readRegenerativeMotionSegment(
  input: {
    id: string;
    sessionHash: string;
    segmentIndex: number;
    now?: number;
  },
) {
  return readWebmOnlySegment({ ...input, namespace: NAMESPACE });
}

export async function verifyRegenerativeMotionChallenge(
  input: {
    id: string;
    sessionHash: string;
    x: number;
    y: number;
    frameIndex: number;
    proofTtlSeconds: number;
    now?: number;
  },
) {
  return verifyWebmOnlyChallenge({ ...input, namespace: NAMESPACE });
}
