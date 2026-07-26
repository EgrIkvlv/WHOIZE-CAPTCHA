import {
  ALL_SHAPES,
  inShape,
  type ShapeName,
} from "@whoize/captcha-core";
import {
  encodeWebmFrames,
  positionAtFrame,
  type ChallengeScene,
} from "../../server-captcha/server/challenge-engine.ts";

const DOT_COLOR = [16, 17, 15, 255] as const;
const BACKGROUND_RGBA32 = 0xffe1e7e8;

export type MatchedMotionProfile = {
  decoyCount: number;
  backgroundCoherence: number;
  clusterAreaRatio: number;
  minimumCenterDistanceScale: number;
  separationWindowSeconds: number;
};

export const V15_MATCHED_MOTION_PROFILE: MatchedMotionProfile = {
  decoyCount: 5,
  backgroundCoherence: 0.82,
  clusterAreaRatio: 0.58,
  minimumCenterDistanceScale: 0.82,
  separationWindowSeconds: 0,
};

export const V15B_HUMAN_TUNED_PROFILE: MatchedMotionProfile = {
  decoyCount: 3,
  backgroundCoherence: 0.58,
  clusterAreaRatio: 0.58,
  minimumCenterDistanceScale: 0.86,
  separationWindowSeconds: 8,
};

export const MATCHED_MOTION_DECOY_COUNT =
  V15_MATCHED_MOTION_PROFILE.decoyCount;
export const HUMAN_TUNED_DECOY_COUNT =
  V15B_HUMAN_TUNED_PROFILE.decoyCount;

type MotionCluster = {
  shape: ShapeName;
  radius: number;
  start: { x: number; y: number };
  velocity: { x: number; y: number };
  visualSeed: number;
  target: boolean;
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

function pointInShape(shape: ShapeName, random: () => number) {
  let x = 0;
  let y = 0;
  do {
    x = random() * 2 - 1;
    y = random() * 2 - 1;
  } while (!inShape(shape, x, y));
  return { x, y };
}

function reflectedCoordinate(
  start: number,
  velocity: number,
  seconds: number,
  minimum: number,
  maximum: number,
) {
  const range = maximum - minimum;
  const period = range * 2;
  const distance = start - minimum + velocity * seconds;
  const wrapped = ((distance % period) + period) % period;
  return wrapped <= range
    ? minimum + wrapped
    : maximum - (wrapped - range);
}

function wrappedCoordinate(
  start: number,
  velocity: number,
  seconds: number,
  maximum: number,
) {
  return ((start + velocity * seconds) % maximum + maximum) % maximum;
}

function clusterPosition(cluster: MotionCluster, scene: ChallengeScene, frameIndex: number) {
  if (cluster.target) return positionAtFrame(scene, frameIndex);
  const margin = cluster.radius + 18;
  const seconds = frameIndex / scene.fps;
  return {
    x: reflectedCoordinate(
      cluster.start.x,
      cluster.velocity.x,
      seconds,
      margin,
      scene.width - margin,
    ),
    y: reflectedCoordinate(
      cluster.start.y,
      cluster.velocity.y,
      seconds,
      margin,
      scene.height - margin,
    ),
  };
}

function clustersStaySeparated({
  candidate,
  clusters,
  scene,
  profile,
}: {
  candidate: MotionCluster;
  clusters: MotionCluster[];
  scene: ChallengeScene;
  profile: MatchedMotionProfile;
}) {
  const lastFrame = Math.min(
    scene.durationFrames - 1,
    Math.round(profile.separationWindowSeconds * scene.fps),
  );
  const step = Math.max(1, Math.round(scene.fps / 2));
  for (let frameIndex = 0; frameIndex <= lastFrame; frameIndex += step) {
    const candidateCenter = clusterPosition(candidate, scene, frameIndex);
    for (const other of clusters) {
      const otherCenter = clusterPosition(other, scene, frameIndex);
      const minimumDistance =
        (candidate.radius + other.radius) *
        profile.minimumCenterDistanceScale;
      if (
        Math.hypot(
          candidateCenter.x - otherCenter.x,
          candidateCenter.y - otherCenter.y,
        ) < minimumDistance
      ) {
        return false;
      }
    }
  }
  return true;
}

function createClusters(
  scene: ChallengeScene,
  profile: MatchedMotionProfile,
) {
  const random = mulberry32(scene.visualSeed ^ 0x15dec0);
  const decoyShapes = ALL_SHAPES.filter((shape) => shape !== scene.shape);
  const clusters: MotionCluster[] = [
    {
      shape: scene.shape,
      radius: scene.radius,
      start: scene.start,
      velocity: scene.velocity,
      visualSeed: scene.visualSeed ^ 0xa711,
      target: true,
    },
  ];
  const targetSpeed = Math.hypot(scene.velocity.x, scene.velocity.y);

  if (profile.separationWindowSeconds <= 0) {
    const starts = [scene.start];
    for (let index = 0; index < profile.decoyCount; index += 1) {
      const radius = scene.radius * (0.92 + random() * 0.16);
      const margin = radius + 18;
      let start = {
        x: margin + random() * (scene.width - margin * 2),
        y: margin + random() * (scene.height - margin * 2),
      };
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const candidate = {
          x: margin + random() * (scene.width - margin * 2),
          y: margin + random() * (scene.height - margin * 2),
        };
        if (
          starts.every(
            (other) =>
              Math.hypot(candidate.x - other.x, candidate.y - other.y) >
              scene.radius * 1.65,
          )
        ) {
          start = candidate;
          break;
        }
      }
      starts.push(start);
      const angle = random() * Math.PI * 2;
      const speed = targetSpeed * (0.9 + random() * 0.2);
      clusters.push({
        shape: decoyShapes[index % decoyShapes.length],
        radius,
        start,
        velocity: {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed,
        },
        visualSeed: (random() * 0xffffffff) >>> 0,
        target: false,
      });
    }
    return clusters;
  }

  for (let index = 0; index < profile.decoyCount; index += 1) {
    let accepted: MotionCluster | null = null;
    let fallback: MotionCluster | null = null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const radius = scene.radius * (0.92 + random() * 0.16);
      const margin = radius + 18;
      const angle = random() * Math.PI * 2;
      const speed = targetSpeed * (0.9 + random() * 0.2);
      const candidate: MotionCluster = {
        shape: decoyShapes[index % decoyShapes.length],
        radius,
        start: {
          x: margin + random() * (scene.width - margin * 2),
          y: margin + random() * (scene.height - margin * 2),
        },
        velocity: {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed,
        },
        visualSeed: (random() * 0xffffffff) >>> 0,
        target: false,
      };
      fallback = candidate;
      if (
        clustersStaySeparated({
          candidate,
          clusters,
          scene,
          profile,
        })
      ) {
        accepted = candidate;
        break;
      }
    }
    const selected = accepted ?? fallback;
    if (selected) clusters.push(selected);
  }
  return clusters;
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

export function createMatchedMotionOccupancyRenderer(
  scene: ChallengeScene,
  profile = V15_MATCHED_MOTION_PROFILE,
) {
  const clusters = createClusters(scene, profile);
  const clusterPointCount = Math.max(
    150,
    Math.floor(
      scene.density *
        ((scene.radius * scene.radius * 4 * profile.clusterAreaRatio) /
          (scene.width * scene.height)),
    ),
  );
  const clusterPoints = clusters.map((cluster) => {
    const random = mulberry32(cluster.visualSeed);
    return Array.from({ length: clusterPointCount }, () => ({
      ...pointInShape(cluster.shape, random),
      stable: random() * 100 < scene.coherence,
    }));
  });
  const backgroundCount = Math.max(
    0,
    scene.density - clusterPointCount * clusters.length,
  );
  const backgroundRandom = mulberry32(scene.visualSeed ^ 0xbacc15);
  const targetSpeed = Math.hypot(scene.velocity.x, scene.velocity.y);
  const backgroundPoints = Array.from({ length: backgroundCount }, () => {
    const angle = backgroundRandom() * Math.PI * 2;
    const speed = targetSpeed * (0.72 + backgroundRandom() * 0.56);
    return {
      x: backgroundRandom() * scene.width,
      y: backgroundRandom() * scene.height,
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed,
      coherent: backgroundRandom() < profile.backgroundCoherence,
      phase: (backgroundRandom() * 0xffffffff) >>> 0,
    };
  });

  return (globalFrameIndex: number) => {
    const occupied = new Set<number>();
    const seconds = globalFrameIndex / scene.fps;
    const freshRandom = mulberry32(
      (scene.visualSeed ^ Math.imul(globalFrameIndex + 1, 0x9e3779b1)) >>> 0,
    );

    for (const point of backgroundPoints) {
      const x = point.coherent
        ? wrappedCoordinate(point.x, point.velocityX, seconds, scene.width)
        : mulberry32(point.phase ^ Math.imul(globalFrameIndex + 1, 0x85ebca6b))() *
          scene.width;
      const y = point.coherent
        ? wrappedCoordinate(point.y, point.velocityY, seconds, scene.height)
        : mulberry32(point.phase ^ Math.imul(globalFrameIndex + 1, 0xc2b2ae35))() *
          scene.height;
      occupied.add(
        Math.max(0, Math.min(scene.height - 1, Math.round(y))) * scene.width +
          Math.max(0, Math.min(scene.width - 1, Math.round(x))),
      );
    }

    clusters.forEach((cluster, clusterIndex) => {
      const center = clusterPosition(cluster, scene, globalFrameIndex);
      for (const point of clusterPoints[clusterIndex]) {
        const current = point.stable
          ? point
          : pointInShape(cluster.shape, freshRandom);
        const x = Math.max(
          0,
          Math.min(
            scene.width - 1,
            Math.round(center.x + current.x * cluster.radius),
          ),
        );
        const y = Math.max(
          0,
          Math.min(
            scene.height - 1,
            Math.round(center.y + current.y * cluster.radius),
          ),
        );
        occupied.add(y * scene.width + x);
      }
    });

    while (occupied.size < scene.density) {
      const x = Math.floor(freshRandom() * scene.width);
      const y = Math.floor(freshRandom() * scene.height);
      occupied.add(y * scene.width + x);
    }
    return Uint32Array.from(occupied);
  };
}

export function createMatchedMotionFrameRenderer(
  scene: ChallengeScene,
  profile = V15_MATCHED_MOTION_PROFILE,
) {
  const renderOccupancy = createMatchedMotionOccupancyRenderer(scene, profile);
  return (globalFrameIndex: number) => {
    const pixels = new Uint8Array(scene.width * scene.height * 4);
    new Uint32Array(pixels.buffer).fill(BACKGROUND_RGBA32);
    for (const cell of renderOccupancy(globalFrameIndex)) {
      drawSquare(pixels, scene, cell);
    }
    return pixels;
  };
}

export async function renderMatchedMotionSegment({
  scene,
  segmentIndex,
  wasmBinary,
  profile = V15_MATCHED_MOTION_PROFILE,
}: {
  scene: ChallengeScene;
  segmentIndex: number;
  wasmBinary: ArrayBuffer;
  profile?: MatchedMotionProfile;
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
    renderFrame: createMatchedMotionFrameRenderer(scene, profile),
  });
}
