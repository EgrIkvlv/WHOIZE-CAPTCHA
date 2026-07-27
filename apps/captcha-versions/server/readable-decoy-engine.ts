import { inShape, shapeAreaRatio } from "@whoize/captcha-core";
import {
  encodeWebmFrames,
  positionAtFrame,
  type ChallengeScene,
  type Point,
} from "../../server-captcha/server/challenge-engine.ts";
import { createStochasticTrajectory } from "./regenerative-motion-engine.ts";

const DOT_COLOR = [16, 17, 15, 255] as const;
const BACKGROUND_RGBA32 = 0xffe1e7e8;

export const V18_READABLE_DECOY_COUNT = 4;

type FragmentMask = {
  phase: number;
  radial: number[];
};

type ReadableDecoy = {
  radius: number;
  path: Point[];
  mask: FragmentMask;
  points: Point[];
  phase: number;
};

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

function createFragmentMask(random: () => number): FragmentMask {
  const radial = Array.from({ length: 12 }, () => 0.72 + random() * 0.28);
  const firstNotch = Math.floor(random() * radial.length);
  const secondNotch = (firstNotch + 4 + Math.floor(random() * 5)) % radial.length;
  radial[firstNotch] *= 0.48;
  radial[(firstNotch + 1) % radial.length] *= 0.7;
  radial[secondNotch] *= 0.55;
  return { phase: random() * Math.PI * 2, radial };
}

function insideFragmentMask(mask: FragmentMask, point: Point) {
  const distance = Math.hypot(point.x, point.y);
  if (distance > 1) return false;
  const normalized =
    (((Math.atan2(point.y, point.x) - mask.phase) / (Math.PI * 2)) % 1 + 1) %
    1;
  const scaled = normalized * mask.radial.length;
  const index = Math.floor(scaled) % mask.radial.length;
  const next = (index + 1) % mask.radial.length;
  const amount = scaled - Math.floor(scaled);
  const boundary =
    mask.radial[index] * (1 - amount) + mask.radial[next] * amount;
  return distance <= boundary;
}

function pointInFragmentMask(mask: FragmentMask, random: () => number) {
  let point = { x: 0, y: 0 };
  do {
    point = { x: random() * 2 - 1, y: random() * 2 - 1 };
  } while (!insideFragmentMask(mask, point));
  return point;
}

function pathSeparationScore({
  scene,
  radius,
  path,
  existing,
}: {
  scene: ChallengeScene;
  radius: number;
  path: Point[];
  existing: Array<{ radius: number; path: Point[] }>;
}) {
  const lastFrame = Math.min(scene.durationFrames - 1, scene.fps * 7);
  const step = Math.max(1, Math.round(scene.fps / 3));
  let smallestRatio = Number.POSITIVE_INFINITY;
  for (let frameIndex = 0; frameIndex <= lastFrame; frameIndex += step) {
    const center = path[frameIndex];
    for (const other of existing) {
      const otherCenter = other.path[frameIndex];
      const ratio =
        Math.hypot(center.x - otherCenter.x, center.y - otherCenter.y) /
        (radius + other.radius);
      smallestRatio = Math.min(smallestRatio, ratio);
    }
  }
  return smallestRatio;
}

function createReadableDecoys(
  scene: ChallengeScene,
  pointCount: number,
) {
  const random = mulberry32(scene.visualSeed ^ 0x18dec0);
  const targetPath =
    scene.trajectory ??
    Array.from({ length: scene.durationFrames }, (_, frameIndex) =>
      positionAtFrame(scene, frameIndex),
    );
  const existing: Array<{ radius: number; path: Point[] }> = [
    { radius: scene.radius, path: targetPath },
  ];
  const decoys: ReadableDecoy[] = [];
  const targetSpeed = Math.hypot(scene.velocity.x, scene.velocity.y);

  for (let index = 0; index < V18_READABLE_DECOY_COUNT; index += 1) {
    let best:
      | {
          radius: number;
          path: Point[];
          score: number;
          seed: number;
        }
      | undefined;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const radius = scene.radius * (0.9 + random() * 0.14);
      const margin = radius + 18;
      const angle = random() * Math.PI * 2;
      const speed = targetSpeed * (0.9 + random() * 0.2);
      const seed = (random() * 0xffffffff) >>> 0;
      const path = createStochasticTrajectory(scene, {
        start: {
          x: margin + random() * (scene.width - margin * 2),
          y: margin + random() * (scene.height - margin * 2),
        },
        velocity: {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed,
        },
        radius,
        seed,
      });
      const score = pathSeparationScore({
        scene,
        radius,
        path,
        existing,
      });
      if (!best || score > best.score) {
        best = { radius, path, score, seed };
      }
      if (score >= 0.88) break;
    }
    if (!best) continue;
    const maskRandom = mulberry32(best.seed ^ 0xb10b);
    const mask = createFragmentMask(maskRandom);
    decoys.push({
      radius: best.radius,
      path: best.path,
      mask,
      points: Array.from({ length: pointCount }, () =>
        pointInFragmentMask(mask, maskRandom),
      ),
      phase: maskRandom() * Math.PI * 2,
    });
    existing.push({ radius: best.radius, path: best.path });
  }
  return decoys;
}

function lifecycle(frameIndex: number, seed: number) {
  const lifetime = 2 + (seed % 4);
  const phase = (seed >>> 8) % lifetime;
  const shifted = frameIndex + phase;
  return {
    age: shifted % lifetime,
    cycle: Math.floor(shifted / lifetime),
  };
}

function wrappedCoordinate(value: number, maximum: number) {
  return ((value % maximum) + maximum) % maximum;
}

function drawSquare(pixels: Uint8Array, scene: ChallengeScene, cell: number) {
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

export function createReadableDecoyOccupancyRenderer(scene: ChallengeScene) {
  const targetRandom = mulberry32(scene.visualSeed ^ 0x18a711);
  const targetRatio =
    (scene.radius * scene.radius * 4 * shapeAreaRatio(scene.shape)) /
    (scene.width * scene.height);
  const targetPointCount = Math.max(
    190,
    Math.floor(scene.density * targetRatio),
  );
  const targetPoints = Array.from({ length: targetPointCount }, () =>
    pointInShape(scene, targetRandom),
  );
  const decoys = createReadableDecoys(scene, targetPointCount);
  const backgroundRandom = mulberry32(scene.visualSeed ^ 0x18bacc);
  const targetSpeed = Math.hypot(scene.velocity.x, scene.velocity.y);
  const backgroundSlots = Array.from(
    { length: scene.density },
    () => (backgroundRandom() * 0xffffffff) >>> 0,
  );

  return (globalFrameIndex: number) => {
    const seconds = globalFrameIndex / scene.fps;
    const targetCenter = positionAtFrame(scene, globalFrameIndex);
    const targetScale = 1 + Math.sin(seconds * 2.2) * 0.018;
    const decoyStates = decoys.map((decoy) => ({
      ...decoy,
      center: decoy.path[
        Math.max(0, Math.min(decoy.path.length - 1, globalFrameIndex))
      ],
      scale: 1 + Math.sin(seconds * 1.9 + decoy.phase) * 0.025,
    }));
    const occupied = new Set<number>();

    for (const point of targetPoints) {
      const x = Math.round(
        targetCenter.x + point.x * scene.radius * targetScale,
      );
      const y = Math.round(
        targetCenter.y + point.y * scene.radius * targetScale,
      );
      occupied.add(
        Math.max(0, Math.min(scene.height - 1, y)) * scene.width +
          Math.max(0, Math.min(scene.width - 1, x)),
      );
    }

    for (const decoy of decoyStates) {
      for (const point of decoy.points) {
        const x = Math.round(
          decoy.center.x + point.x * decoy.radius * decoy.scale,
        );
        const y = Math.round(
          decoy.center.y + point.y * decoy.radius * decoy.scale,
        );
        occupied.add(
          Math.max(0, Math.min(scene.height - 1, y)) * scene.width +
            Math.max(0, Math.min(scene.width - 1, x)),
        );
      }
    }

    for (const slotSeed of backgroundSlots) {
      const fresh = (slotSeed & 0xffff) / 0xffff < 0.58;
      const life = lifecycle(globalFrameIndex, slotSeed);
      const random = mulberry32(
        slotSeed ^
          Math.imul(fresh ? globalFrameIndex + 1 : life.cycle + 1, 0x9e3779b1),
      );
      const startX = random() * scene.width;
      const startY = random() * scene.height;
      const angle = random() * Math.PI * 2;
      const speed = targetSpeed * (0.55 + random() * 0.9);
      const ageSeconds = fresh ? 0 : life.age / scene.fps;
      const x = wrappedCoordinate(
        startX + Math.cos(angle) * speed * ageSeconds,
        scene.width,
      );
      const y = wrappedCoordinate(
        startY + Math.sin(angle) * speed * ageSeconds,
        scene.height,
      );
      if (
        inShape(
          scene.shape,
          (x - targetCenter.x) / (scene.radius * targetScale),
          (y - targetCenter.y) / (scene.radius * targetScale),
        )
      ) {
        continue;
      }
      if (
        decoyStates.some((decoy) =>
          insideFragmentMask(decoy.mask, {
            x: (x - decoy.center.x) / (decoy.radius * decoy.scale),
            y: (y - decoy.center.y) / (decoy.radius * decoy.scale),
          }),
        )
      ) {
        continue;
      }
      occupied.add(
        Math.max(0, Math.min(scene.height - 1, Math.round(y))) * scene.width +
          Math.max(0, Math.min(scene.width - 1, Math.round(x))),
      );
      if (occupied.size >= scene.density) break;
    }

    const fillRandom = mulberry32(
      scene.visualSeed ^ Math.imul(globalFrameIndex + 1, 0x18f111),
    );
    while (occupied.size < scene.density) {
      const x = Math.floor(fillRandom() * scene.width);
      const y = Math.floor(fillRandom() * scene.height);
      if (
        inShape(
          scene.shape,
          (x - targetCenter.x) / (scene.radius * targetScale),
          (y - targetCenter.y) / (scene.radius * targetScale),
        )
      ) {
        continue;
      }
      if (
        decoyStates.some((decoy) =>
          insideFragmentMask(decoy.mask, {
            x: (x - decoy.center.x) / (decoy.radius * decoy.scale),
            y: (y - decoy.center.y) / (decoy.radius * decoy.scale),
          }),
        )
      ) {
        continue;
      }
      occupied.add(y * scene.width + x);
    }
    return Uint32Array.from(occupied);
  };
}

export function createReadableDecoyFrameRenderer(scene: ChallengeScene) {
  const renderOccupancy = createReadableDecoyOccupancyRenderer(scene);
  return (globalFrameIndex: number) => {
    const pixels = new Uint8Array(scene.width * scene.height * 4);
    new Uint32Array(pixels.buffer).fill(BACKGROUND_RGBA32);
    for (const cell of renderOccupancy(globalFrameIndex)) {
      drawSquare(pixels, scene, cell);
    }
    return pixels;
  };
}

export async function renderReadableDecoySegment({
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
    renderFrame: createReadableDecoyFrameRenderer(scene),
  });
}
