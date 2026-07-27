import type { CaptchaConfig } from "@whoize/captcha-core";
import { generateReadableDecoyScene } from "./regenerative-motion-engine.ts";
import {
  createWebmOnlyChallenge,
  readWebmOnlySegment,
  verifyWebmOnlyChallenge,
  webmOnlyPublicChallenge,
  type WebmOnlyChallengeRecord,
} from "./webm-only-service.ts";

const NAMESPACE = "webm-v18";

export async function createReadableDecoyChallenge({
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
    tokenPrefix: "webm18",
    createScene: generateReadableDecoyScene,
    now,
  });
}

export function readableDecoyPublicChallenge(
  record: WebmOnlyChallengeRecord,
) {
  return {
    ...webmOnlyPublicChallenge(record),
    variant: "readable-motion-decoys" as const,
  };
}

export async function readReadableDecoySegment(
  input: {
    id: string;
    sessionHash: string;
    segmentIndex: number;
    now?: number;
  },
) {
  return readWebmOnlySegment({ ...input, namespace: NAMESPACE });
}

export async function verifyReadableDecoyChallenge(
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
