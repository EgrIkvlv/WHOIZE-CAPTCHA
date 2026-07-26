import type { CaptchaConfig } from "@whoize/captcha-core";
import {
  createWebmOnlyChallenge,
  readWebmOnlySegment,
  verifyWebmOnlyChallenge,
  webmOnlyPublicChallenge,
  type WebmOnlyChallengeRecord,
} from "./webm-only-service.ts";

const NAMESPACE = "webm-v15";

export async function createMatchedMotionChallenge({
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
    tokenPrefix: "webm15",
    now,
  });
}

export function matchedMotionPublicChallenge(
  record: WebmOnlyChallengeRecord,
) {
  return {
    ...webmOnlyPublicChallenge(record),
    variant: "matched-motion-decoys" as const,
  };
}

export async function readMatchedMotionSegment(
  input: {
    id: string;
    sessionHash: string;
    segmentIndex: number;
    now?: number;
  },
) {
  return readWebmOnlySegment({ ...input, namespace: NAMESPACE });
}

export async function verifyMatchedMotionChallenge(
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
