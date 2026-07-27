import type { CaptchaConfig } from "@whoize/captcha-core";
import { generateStochasticReadableScene } from "./regenerative-motion-engine.ts";
import {
  createWebmOnlyChallenge,
  readWebmOnlySegment,
  verifyWebmOnlyChallenge,
  webmOnlyPublicChallenge,
  type WebmOnlyChallengeRecord,
} from "./webm-only-service.ts";

const NAMESPACE = "webm-v16";
const READABLE_NAMESPACE = "webm-v16b";
const STOCHASTIC_NAMESPACE = "webm-v17";

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

export async function createReadableRegenerativeChallenge({
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
    namespace: READABLE_NAMESPACE,
    tokenPrefix: "webm16b",
    now,
  });
}

export function readableRegenerativePublicChallenge(
  record: WebmOnlyChallengeRecord,
) {
  return {
    ...webmOnlyPublicChallenge(record),
    variant: "regenerative-readable" as const,
  };
}

export async function readReadableRegenerativeSegment(
  input: {
    id: string;
    sessionHash: string;
    segmentIndex: number;
    now?: number;
  },
) {
  return readWebmOnlySegment({ ...input, namespace: READABLE_NAMESPACE });
}

export async function verifyReadableRegenerativeChallenge(
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
  return verifyWebmOnlyChallenge({ ...input, namespace: READABLE_NAMESPACE });
}

export async function createStochasticReadableChallenge({
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
    namespace: STOCHASTIC_NAMESPACE,
    tokenPrefix: "webm17",
    createScene: generateStochasticReadableScene,
    now,
  });
}

export function stochasticReadablePublicChallenge(
  record: WebmOnlyChallengeRecord,
) {
  return {
    ...webmOnlyPublicChallenge(record),
    variant: "stochastic-readable" as const,
  };
}

export async function readStochasticReadableSegment(
  input: {
    id: string;
    sessionHash: string;
    segmentIndex: number;
    now?: number;
  },
) {
  return readWebmOnlySegment({ ...input, namespace: STOCHASTIC_NAMESPACE });
}

export async function verifyStochasticReadableChallenge(
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
  return verifyWebmOnlyChallenge({ ...input, namespace: STOCHASTIC_NAMESPACE });
}
