import { readFile } from "node:fs/promises";
import { DEFAULT_CAPTCHA_CONFIG } from "@whoize/captcha-core";
import {
  createSparseFramesChallenge,
  verifySparseFramesChallenge,
} from "../../apps/captcha-versions/server/sparse-frames-service.ts";
import { redeemProof } from "../../apps/server-captcha/server/challenge-service.ts";
import {
  createWebmOnlyChallenge,
  webmOnlyPublicChallenge,
} from "../../apps/captcha-versions/server/webm-only-service.ts";
import {
  createMatchedMotionChallenge,
  matchedMotionPublicChallenge,
} from "../../apps/captcha-versions/server/matched-motion-service.ts";

export async function runClientExposureAudit() {
  const source = await readFile(
    new URL(
      "../../apps/captcha-versions/components/SparseFramesCaptcha.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const challengeType = source.match(/type Challenge = \{([\s\S]*?)\n\};/)?.[1] ?? "";
  const exposedFields = [
    ...challengeType.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm),
  ].map((match) => match[1]);
  const directAnswerFields = [
    "center",
    "positions",
    "trajectory",
    "visualSeed",
    "mask",
    "radius",
  ].filter((field) => exposedFields.includes(field));
  return {
    probeId: "client-code-exposure",
    passed: directAnswerFields.length === 0,
    exposedFields,
    directAnswerFields,
    exactOccupancyFramesExposed: exposedFields.includes("frames"),
    conclusion:
      directAnswerFields.length === 0
        ? "No direct answer field is present before verification, but exact final occupancy frames are exposed."
        : "A direct answer field is present in client challenge state.",
  };
}

export async function runWebmOnlyExposureAudit() {
  const runtime = globalThis as typeof globalThis & {
    __whoizeCaptchaRecords?: Map<string, unknown>;
  };
  runtime.__whoizeCaptchaRecords = new Map();
  const { record } = await createWebmOnlyChallenge({
    config: DEFAULT_CAPTCHA_CONFIG,
    sessionHash: "webm-exposure-audit",
    now: 1_800_000_000_000,
  });
  const publicChallenge = webmOnlyPublicChallenge(record);
  const serialized = JSON.stringify(publicChallenge);
  const forbiddenFields = [
    "scene",
    "frames",
    "positions",
    "visualSeed",
    "velocity",
    "start",
    "radius",
    "density",
    "dotSize",
    "coherence",
    "mask",
  ];
  const exposedPrivateFields = forbiddenFields.filter((field) =>
    serialized.includes(`"${field}"`),
  );
  return {
    probeId: "webm-only-client-exposure",
    passed:
      publicChallenge.transport === "webm-only" &&
      exposedPrivateFields.length === 0,
    publicFields: Object.keys(publicChallenge),
    exposedPrivateFields,
    exactOccupancyFramesExposed: false,
    conclusion:
      "v1.4 public state contains playback metadata only; private scene fields and exact occupancy frames are absent.",
  };
}

export async function runMatchedMotionExposureAudit() {
  const runtime = globalThis as typeof globalThis & {
    __whoizeCaptchaRecords?: Map<string, unknown>;
  };
  runtime.__whoizeCaptchaRecords = new Map();
  const { record } = await createMatchedMotionChallenge({
    config: DEFAULT_CAPTCHA_CONFIG,
    sessionHash: "matched-motion-exposure-audit",
    now: 1_800_000_000_000,
  });
  const publicChallenge = matchedMotionPublicChallenge(record);
  const serialized = JSON.stringify(publicChallenge);
  const forbiddenFields = [
    "scene",
    "frames",
    "positions",
    "visualSeed",
    "velocity",
    "start",
    "radius",
    "density",
    "dotSize",
    "coherence",
    "mask",
    "decoys",
  ];
  const exposedPrivateFields = forbiddenFields.filter((field) =>
    serialized.includes(`"${field}"`),
  );
  return {
    probeId: "matched-motion-client-exposure",
    passed:
      publicChallenge.transport === "webm-only" &&
      publicChallenge.variant === "matched-motion-decoys" &&
      exposedPrivateFields.length === 0,
    publicFields: Object.keys(publicChallenge),
    exposedPrivateFields,
    exactOccupancyFramesExposed: false,
    conclusion:
      "v1.5 exposes only playback metadata and its public variant label; target, decoy, and background motion remain server-side.",
  };
}

export async function runReplayProbe() {
  const runtime = globalThis as typeof globalThis & {
    __whoizeCaptchaRecords?: Map<string, unknown>;
  };
  runtime.__whoizeCaptchaRecords = new Map();
  const now = 1_800_000_000_000;
  const sessionHash = "attack-benchmark-session";
  const { record } = await createSparseFramesChallenge({
    config: DEFAULT_CAPTCHA_CONFIG,
    sessionHash,
    now,
  });
  const center = record.scene.positions[0];
  const verified = await verifySparseFramesChallenge({
    id: record.id,
    sessionHash,
    x: center.x,
    y: center.y,
    frameIndex: 0,
    proofTtlSeconds: DEFAULT_CAPTCHA_CONFIG.proofTtlSeconds,
    now: now + 1_000,
  });
  if (!verified.success || !verified.proofToken) {
    throw new Error("Synthetic replay probe could not create a proof");
  }
  const challengeReplay = await verifySparseFramesChallenge({
    id: record.id,
    sessionHash,
    x: center.x,
    y: center.y,
    frameIndex: 0,
    proofTtlSeconds: DEFAULT_CAPTCHA_CONFIG.proofTtlSeconds,
    now: now + 1_100,
  });
  const firstRedemption = await redeemProof({
    token: verified.proofToken,
    sessionHash,
    action: "demo-signup",
    now: now + 1_200,
  });
  const proofReplay = await redeemProof({
    token: verified.proofToken,
    sessionHash,
    action: "demo-signup",
    now: now + 1_300,
  });
  return {
    probeId: "challenge-and-proof-replay",
    passed:
      !challengeReplay.success &&
      challengeReplay.reason === "used" &&
      firstRedemption.success &&
      !proofReplay.success &&
      proofReplay.reason === "used",
    challengeReplay,
    firstRedemption,
    proofReplay,
    conclusion:
      "A solved challenge and its proof are both rejected after their first successful use.",
  };
}
