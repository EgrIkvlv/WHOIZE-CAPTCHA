import type { CaptchaConfig } from "@whoize/captcha-core";
import { generateReadableDecoyScene } from "./regenerative-motion-engine.ts";
import {
  createReadableDecoyOccupancyRenderer,
  V18A_READABLE_DECOY_COUNT,
  V18B_READABLE_DECOY_COUNT,
} from "./readable-decoy-engine.ts";
import { encodeSparseOccupancyFrames } from "./sparse-frames-engine.ts";
import {
  createWebmOnlyChallenge,
  readWebmOnlySegment,
  verifyWebmOnlyChallenge,
  webmOnlyPublicChallenge,
  type WebmOnlyChallengeRecord,
} from "./webm-only-service.ts";

const V18A_NAMESPACE = "webm-v18a";
const V18B_NAMESPACE = "webm-v18b";
const V18C_NAMESPACE = "points-v18c";
export const V18C_LOOP_SECONDS = 4;

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
    namespace: V18A_NAMESPACE,
    tokenPrefix: "webm18a",
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
  return readWebmOnlySegment({ ...input, namespace: V18A_NAMESPACE });
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
  return verifyWebmOnlyChallenge({ ...input, namespace: V18A_NAMESPACE });
}

export async function createReadableSoloChallenge({
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
    namespace: V18B_NAMESPACE,
    tokenPrefix: "webm18b",
    createScene: generateReadableDecoyScene,
    now,
  });
}

export function readableSoloPublicChallenge(
  record: WebmOnlyChallengeRecord,
) {
  return {
    ...webmOnlyPublicChallenge(record),
    variant: "readable-motion-solo" as const,
  };
}

export async function readReadableSoloSegment(
  input: {
    id: string;
    sessionHash: string;
    segmentIndex: number;
    now?: number;
  },
) {
  return readWebmOnlySegment({ ...input, namespace: V18B_NAMESPACE });
}

export async function verifyReadableSoloChallenge(
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
  return verifyWebmOnlyChallenge({ ...input, namespace: V18B_NAMESPACE });
}

export async function createReadablePointChallenge({
  config,
  sessionHash,
  now = Date.now(),
}: {
  config: CaptchaConfig;
  sessionHash: string;
  now?: number;
}) {
  const { record } = await createWebmOnlyChallenge({
    config,
    sessionHash,
    namespace: V18C_NAMESPACE,
    tokenPrefix: "points18c",
    createScene: generateReadableDecoyScene,
    now,
  });
  const frameCount = record.scene.fps * V18C_LOOP_SECONDS;
  const renderOccupancy = createReadableDecoyOccupancyRenderer(record.scene, {
    decoyCount: V18A_READABLE_DECOY_COUNT,
  });
  const frames = Array.from({ length: frameCount }, (_, frameIndex) =>
    Uint32Array.from(
      [...renderOccupancy(frameIndex)].sort((left, right) => left - right),
    ),
  );
  const payload = encodeSparseOccupancyFrames({
    width: record.scene.width,
    height: record.scene.height,
    fps: record.scene.fps,
    dotSize: record.scene.dotSize,
    density: record.scene.density,
    frames,
    loop: true,
  });
  return { record, payload, frameCount };
}

export async function verifyReadablePointChallenge(
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
  return verifyWebmOnlyChallenge({ ...input, namespace: V18C_NAMESPACE });
}

export const READABLE_MOTION_DECOY_COUNTS = {
  v18a: V18A_READABLE_DECOY_COUNT,
  v18b: V18B_READABLE_DECOY_COUNT,
} as const;
