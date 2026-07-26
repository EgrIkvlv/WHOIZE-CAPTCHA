import { inShape, shapeAreaRatio } from "@whoize/captcha-core";
import {
  encodeWebmFrames,
  generateChallengeScene,
  positionAtFrame,
  type ChallengeScene,
} from "../../server-captcha/server/challenge-engine.ts";

const DOT_COLOR = [16, 17, 15, 255] as const;
const BACKGROUND_RGBA32 = 0xffe1e7e8;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pointInShape(scene: ChallengeScene, random: () => number) {
  let x = 0;
  let y = 0;
  do {
    x = random() * 2 - 1;
    y = random() * 2 - 1;
  } while (!inShape(scene.shape, x, y));
  return { x, y };
}

function drawSquare(
  pixels: Uint8Array,
  scene: ChallengeScene,
  cell: number,
) {
  const x = cell % scene.width;
  const y = Math.floor(cell / scene.width);
  const endX = Math.min(scene.width, Math.ceil(x + scene.dotSize));
  const endY = Math.min(scene.height, Math.ceil(y + scene.dotSize));
  for (let pixelY = y; pixelY < endY; pixelY += 1) {
    for (let pixelX = x; pixelX < endX; pixelX += 1) {
      const offset = (pixelY * scene.width + pixelX) * 4;
      pixels[offset] = DOT_COLOR[0];
      pixels[offset + 1] = DOT_COLOR[1];
      pixels[offset + 2] = DOT_COLOR[2];
      pixels[offset + 3] = DOT_COLOR[3];
    }
  }
}

export function createDynamicNoiseOccupancyRenderer(scene: ChallengeScene) {
  const targetRandom = mulberry32(scene.visualSeed ^ 0xa711);
  const targetRatio =
    (scene.radius * scene.radius * 4 * shapeAreaRatio(scene.shape)) /
    (scene.width * scene.height);
  const targetCount = Math.max(
    120,
    Math.floor(scene.density * targetRatio),
  );
  const targetPoints = Array.from({ length: targetCount }, () => ({
    ...pointInShape(scene, targetRandom),
    stable: targetRandom() * 100 < scene.coherence,
  }));

  return (globalFrameIndex: number) => {
    const center = positionAtFrame(scene, globalFrameIndex);
    const frameRandom = mulberry32(
      (scene.visualSeed ^ Math.imul(globalFrameIndex + 1, 0x9e3779b1)) >>> 0,
    );
    const occupied = new Set<number>();

    for (const point of targetPoints) {
      const current = point.stable
        ? point
        : pointInShape(scene, frameRandom);
      const x = Math.max(
        0,
        Math.min(
          scene.width - 1,
          Math.round(center.x + current.x * scene.radius),
        ),
      );
      const y = Math.max(
        0,
        Math.min(
          scene.height - 1,
          Math.round(center.y + current.y * scene.radius),
        ),
      );
      occupied.add(y * scene.width + x);
    }

    while (occupied.size < scene.density) {
      const x = Math.floor(frameRandom() * scene.width);
      const y = Math.floor(frameRandom() * scene.height);
      if (
        !inShape(
          scene.shape,
          (x - center.x) / scene.radius,
          (y - center.y) / scene.radius,
        )
      ) {
        occupied.add(y * scene.width + x);
      }
    }

    return Uint32Array.from(occupied);
  };
}

export function createDynamicNoiseFrameRenderer(scene: ChallengeScene) {
  const renderOccupancy = createDynamicNoiseOccupancyRenderer(scene);
  return (globalFrameIndex: number) => {
    const pixels = new Uint8Array(scene.width * scene.height * 4);
    new Uint32Array(pixels.buffer).fill(BACKGROUND_RGBA32);
    for (const cell of renderOccupancy(globalFrameIndex)) {
      drawSquare(pixels, scene, cell);
    }
    return pixels;
  };
}

export async function renderWebmOnlySegment({
  scene,
  segmentIndex,
  wasmBinary,
}: {
  scene: ChallengeScene;
  segmentIndex: number;
  wasmBinary: ArrayBuffer;
}) {
  const firstFrame = segmentIndex * scene.segmentFrames;
  const lastFrame = Math.min(
    firstFrame + scene.segmentFrames,
    scene.durationFrames,
  );
  return encodeWebmFrames({
    width: scene.width,
    height: scene.height,
    fps: scene.fps,
    firstFrame,
    lastFrame,
    wasmBinary,
    renderFrame: createDynamicNoiseFrameRenderer(scene),
  });
}

export { generateChallengeScene };
