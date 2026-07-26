import type { CaptchaConfig } from "@whoize/captcha-core";
import {
  createWebmOnlyChallenge,
  readWebmOnlySegment,
  verifyWebmOnlyChallenge,
  webmOnlyPublicChallenge,
  type WebmOnlyChallengeRecord,
} from "./webm-only-service.ts";

const NAMESPACE = "webm-v15";
const HUMAN_TUNED_NAMESPACE = "webm-v15b";

export function humanTunedConfig(config: CaptchaConfig): CaptchaConfig {
  const radiusMin = Math.max(74, config.radiusMin);
  const radiusMax = Math.max(radiusMin + 4, 82, config.radiusMax);
  return {
    ...config,
    density: Math.min(6_200, config.density),
    radiusMin,
    radiusMax,
  };
}

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

export async function createHumanTunedChallenge({
  config,
  sessionHash,
  now = Date.now(),
}: {
  config: CaptchaConfig;
  sessionHash: string;
  now?: number;
}) {
  return createWebmOnlyChallenge({
    config: humanTunedConfig(config),
    sessionHash,
    namespace: HUMAN_TUNED_NAMESPACE,
    tokenPrefix: "webm15b",
    now,
  });
}

export function humanTunedPublicChallenge(
  record: WebmOnlyChallengeRecord,
) {
  return {
    ...webmOnlyPublicChallenge(record),
    variant: "human-tuned-decoys" as const,
  };
}

export async function readHumanTunedSegment(
  input: {
    id: string;
    sessionHash: string;
    segmentIndex: number;
    now?: number;
  },
) {
  return readWebmOnlySegment({
    ...input,
    namespace: HUMAN_TUNED_NAMESPACE,
  });
}

export async function verifyHumanTunedChallenge(
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
  return verifyWebmOnlyChallenge({
    ...input,
    namespace: HUMAN_TUNED_NAMESPACE,
  });
}
