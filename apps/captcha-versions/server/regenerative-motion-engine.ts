import {
  inShape,
  shapeAreaRatio,
  type CaptchaConfig,
} from "@whoize/captcha-core";
import {
  encodeWebmFrames,
  generateChallengeScene,
  positionAtFrame,
  type ChallengeScene,
  type Point,
} from "../../server-captcha/server/challenge-engine.ts";

const DOT_COLOR = [16, 17, 15, 255] as const;
const BACKGROUND_RGBA32 = 0xffe1e7e8;

export type RegenerativeMotionProfile = {
  freshBackgroundRatio: number;
  backgroundLifetimeMin: number;
  backgroundLifetimeMax: number;
  targetLifetimeMin: number;
  targetLifetimeMax: number;
  backgroundTileSize: number;
  backgroundDirectionJitter: number;
  internalMotionMin: number;
  internalMotionMax: number;
  targetAnchorRatio?: number;
  targetAnchorLifetimeMin?: number;
  targetAnchorLifetimeMax?: number;
  backgroundAnchorRatio?: number;
  backgroundAnchorLifetimeMin?: number;
  backgroundAnchorLifetimeMax?: number;
};

export const V16_REGENERATIVE_MOTION_PROFILE: RegenerativeMotionProfile = {
  freshBackgroundRatio: 0.42,
  backgroundLifetimeMin: 4,
  backgroundLifetimeMax: 9,
  targetLifetimeMin: 4,
  targetLifetimeMax: 9,
  backgroundTileSize: 80,
  backgroundDirectionJitter: 0.82,
  internalMotionMin: 0.045,
  internalMotionMax: 0.14,
};

export const V16B_READABLE_REGENERATIVE_PROFILE: RegenerativeMotionProfile = {
  freshBackgroundRatio: 0.48,
  backgroundLifetimeMin: 3,
  backgroundLifetimeMax: 8,
  targetLifetimeMin: 8,
  targetLifetimeMax: 12,
  backgroundTileSize: 64,
  backgroundDirectionJitter: 0.95,
  internalMotionMin: 0.028,
  internalMotionMax: 0.078,
};

export const V17_STOCHASTIC_READABLE_PROFILE: RegenerativeMotionProfile = {
  freshBackgroundRatio: 0.48,
  backgroundLifetimeMin: 3,
  backgroundLifetimeMax: 7,
  targetLifetimeMin: 5,
  targetLifetimeMax: 9,
  backgroundTileSize: 56,
  backgroundDirectionJitter: 1.08,
  internalMotionMin: 0.022,
  internalMotionMax: 0.062,
  targetAnchorRatio: 0.3,
  targetAnchorLifetimeMin: 14,
  targetAnchorLifetimeMax: 20,
  backgroundAnchorRatio: 0.18,
  backgroundAnchorLifetimeMin: 12,
  backgroundAnchorLifetimeMax: 18,
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

function lifecycle(
  frameIndex: number,
  slotSeed: number,
  minimum: number,
  maximum: number,
) {
  const span = maximum - minimum + 1;
  const lifetime = minimum + (slotSeed % span);
  const phase = (slotSeed >>> 8) % lifetime;
  const shiftedFrame = frameIndex + phase;
  return {
    lifetime,
    ageFrames: shiftedFrame % lifetime,
    cycle: Math.floor(shiftedFrame / lifetime),
  };
}

function fitInsideShape(
  scene: ChallengeScene,
  point: { x: number; y: number },
) {
  let x = point.x;
  let y = point.y;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (inShape(scene.shape, x, y)) return { x, y };
    x *= 0.82;
    y *= 0.82;
  }
  return { x: 0, y: 0 };
}

function wrappedCoordinate(value: number, maximum: number) {
  return ((value % maximum) + maximum) % maximum;
}

function normalizeAngle(value: number) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function interpolateAngle(from: number, to: number, amount: number) {
  return from + normalizeAngle(to - from) * amount;
}

export function createStochasticTrajectory(
  scene: ChallengeScene,
  {
    start = scene.start,
    velocity = scene.velocity,
    radius = scene.radius,
    seed = scene.visualSeed ^ 0x17c0ffee,
  }: {
    start?: Point;
    velocity?: Point;
    radius?: number;
    seed?: number;
  } = {},
) {
  const random = mulberry32(seed);
  const margin = radius + 18;
  const center = { x: scene.width / 2, y: scene.height / 2 };
  const positions: Point[] = [];
  let position = { ...start };
  let heading = Math.atan2(velocity.y, velocity.x);
  let turnRate = 0;
  let desiredTurnRate = 0;
  const baseSpeed = Math.hypot(velocity.x, velocity.y);
  let speed = baseSpeed;
  let desiredSpeed = baseSpeed;
  let nextSteeringFrame = 0;

  for (
    let frameIndex = 0;
    frameIndex < scene.durationFrames;
    frameIndex += 1
  ) {
    positions.push({ ...position });
    if (frameIndex >= nextSteeringFrame) {
      desiredTurnRate = (random() * 2 - 1) * 1.45;
      desiredSpeed = baseSpeed * (0.76 + random() * 0.48);
      nextSteeringFrame =
        frameIndex + Math.round(scene.fps * (0.28 + random() * 0.46));
    }

    const edgeDistance = Math.min(
      position.x - margin,
      scene.width - margin - position.x,
      position.y - margin,
      scene.height - margin - position.y,
    );
    if (edgeDistance < 58) {
      const inwardHeading = Math.atan2(
        center.y - position.y,
        center.x - position.x,
      );
      const inwardWeight = Math.min(0.22, (58 - edgeDistance) / 230);
      heading = interpolateAngle(heading, inwardHeading, inwardWeight);
      desiredTurnRate *= 0.72;
    }

    turnRate += (desiredTurnRate - turnRate) * 0.075;
    speed += (desiredSpeed - speed) * 0.055;
    heading = normalizeAngle(heading + turnRate / scene.fps);
    position = {
      x: position.x + (Math.cos(heading) * speed) / scene.fps,
      y: position.y + (Math.sin(heading) * speed) / scene.fps,
    };

    if (position.x < margin || position.x > scene.width - margin) {
      position.x = Math.max(margin, Math.min(scene.width - margin, position.x));
      heading = normalizeAngle(Math.PI - heading + (random() - 0.5) * 0.32);
      desiredTurnRate *= -0.45;
    }
    if (position.y < margin || position.y > scene.height - margin) {
      position.y = Math.max(margin, Math.min(scene.height - margin, position.y));
      heading = normalizeAngle(-heading + (random() - 0.5) * 0.32);
      desiredTurnRate *= -0.45;
    }
  }

  return positions;
}

export function stochasticReadableConfig(config: CaptchaConfig): CaptchaConfig {
  const radiusMin = Math.max(46, Math.round(config.radiusMin * 0.82));
  const radiusMax = Math.max(
    radiusMin + 4,
    Math.round(config.radiusMax * 0.82),
  );
  return {
    ...config,
    radiusMin,
    radiusMax,
  };
}

export function generateStochasticReadableScene(
  config: CaptchaConfig,
  seed: number,
) {
  const scene = generateChallengeScene(stochasticReadableConfig(config), seed);
  return {
    ...scene,
    trajectory: createStochasticTrajectory(scene),
  };
}

export function readableDecoyConfig(config: CaptchaConfig): CaptchaConfig {
  const radiusMin = Math.max(
    54,
    Math.min(60, Math.round(config.radiusMin * 0.92)),
  );
  const radiusMax = Math.max(
    radiusMin + 4,
    Math.min(68, Math.round(config.radiusMax * 0.92)),
  );
  return {
    ...config,
    radiusMin,
    radiusMax,
  };
}

export function generateReadableDecoyScene(
  config: CaptchaConfig,
  seed: number,
) {
  const scene = generateChallengeScene(readableDecoyConfig(config), seed);
  return {
    ...scene,
    trajectory: createStochasticTrajectory(scene),
  };
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

export function createRegenerativeMotionOccupancyRenderer(
  scene: ChallengeScene,
  profile = V16_REGENERATIVE_MOTION_PROFILE,
) {
  const seedRandom = mulberry32(scene.visualSeed ^ 0x16a11ce);
  const targetRatio =
    (scene.radius * scene.radius * 4 * shapeAreaRatio(scene.shape)) /
    (scene.width * scene.height);
  const targetCount = Math.max(150, Math.floor(scene.density * targetRatio));
  const backgroundCount = scene.density;
  const targetSlots = Array.from(
    { length: targetCount },
    () => (seedRandom() * 0xffffffff) >>> 0,
  );
  const backgroundSlots = Array.from(
    { length: backgroundCount },
    () => (seedRandom() * 0xffffffff) >>> 0,
  );
  const targetSpeed = Math.hypot(scene.velocity.x, scene.velocity.y);

  return (globalFrameIndex: number) => {
    const center = positionAtFrame(scene, globalFrameIndex);
    const backgroundOccupied = new Set<number>();

    for (const slotSeed of backgroundSlots) {
      const slotRatio = (slotSeed & 0xffff) / 0xffff;
      const anchor =
        slotRatio < (profile.backgroundAnchorRatio ?? 0);
      const permanentlyFresh =
        !anchor &&
        slotRatio <
          (profile.backgroundAnchorRatio ?? 0) +
            profile.freshBackgroundRatio;
      const life = lifecycle(
        globalFrameIndex,
        slotSeed,
        permanentlyFresh
          ? 1
          : anchor
            ? (profile.backgroundAnchorLifetimeMin ??
              profile.backgroundLifetimeMin)
            : profile.backgroundLifetimeMin,
        permanentlyFresh
          ? 1
          : anchor
            ? (profile.backgroundAnchorLifetimeMax ??
              profile.backgroundLifetimeMax)
            : profile.backgroundLifetimeMax,
      );
      const random = mulberry32(
        (slotSeed ^ Math.imul(life.cycle + 1, 0x9e3779b1)) >>> 0,
      );
      const startX = random() * scene.width;
      const startY = random() * scene.height;
      const tileX = Math.floor(startX / profile.backgroundTileSize);
      const tileY = Math.floor(startY / profile.backgroundTileSize);
      const tileSeed =
        scene.visualSeed ^
        Math.imul(tileX + 1, 0x85ebca6b) ^
        Math.imul(tileY + 1, 0xc2b2ae35) ^
        Math.imul(life.cycle + 1, 0x27d4eb2d);
      const tileRandom = mulberry32(tileSeed >>> 0);
      const baseAngle = tileRandom() * Math.PI * 2;
      const angle =
        baseAngle +
        (random() * 2 - 1) * profile.backgroundDirectionJitter;
      const speed = targetSpeed * (0.58 + random() * 0.84);
      const seconds = life.ageFrames / scene.fps;
      const x = wrappedCoordinate(
        startX + Math.cos(angle) * speed * seconds,
        scene.width,
      );
      const y = wrappedCoordinate(
        startY + Math.sin(angle) * speed * seconds,
        scene.height,
      );
      if (
        !inShape(
          scene.shape,
          (x - center.x) / scene.radius,
          (y - center.y) / scene.radius,
        )
      ) {
        backgroundOccupied.add(
          Math.max(0, Math.min(scene.height - 1, Math.round(y))) * scene.width +
            Math.max(0, Math.min(scene.width - 1, Math.round(x))),
        );
      }
    }

    const targetOccupied = new Set<number>();
    for (const slotSeed of targetSlots) {
      const anchor =
        (slotSeed & 0xffff) / 0xffff < (profile.targetAnchorRatio ?? 0);
      const life = lifecycle(
        globalFrameIndex,
        slotSeed,
        anchor
          ? (profile.targetAnchorLifetimeMin ?? profile.targetLifetimeMin)
          : profile.targetLifetimeMin,
        anchor
          ? (profile.targetAnchorLifetimeMax ?? profile.targetLifetimeMax)
          : profile.targetLifetimeMax,
      );
      const random = mulberry32(
        (slotSeed ^ Math.imul(life.cycle + 1, 0x165667b1)) >>> 0,
      );
      const base = pointInShape(scene, random);
      const phase = random() * Math.PI * 2;
      const amplitude =
        profile.internalMotionMin +
        random() * (profile.internalMotionMax - profile.internalMotionMin);
      const frequency = 0.7 + random() * 1.4;
      const age = life.ageFrames / Math.max(1, life.lifetime - 1);
      const internal = fitInsideShape(scene, {
        x: base.x + Math.cos(phase + age * Math.PI * 2 * frequency) * amplitude,
        y: base.y + Math.sin(phase + age * Math.PI * 2 * frequency) * amplitude,
      });
      const x = Math.max(
        0,
        Math.min(scene.width - 1, Math.round(center.x + internal.x * scene.radius)),
      );
      const y = Math.max(
        0,
        Math.min(
          scene.height - 1,
          Math.round(center.y + internal.y * scene.radius),
        ),
      );
      targetOccupied.add(y * scene.width + x);
    }

    const occupied = new Set(targetOccupied);
    for (const cell of backgroundOccupied) {
      if (occupied.size >= scene.density) break;
      occupied.add(cell);
    }
    const fillRandom = mulberry32(
      (scene.visualSeed ^ Math.imul(globalFrameIndex + 1, 0xd3a2646c)) >>> 0,
    );
    while (occupied.size < scene.density) {
      const x = Math.floor(fillRandom() * scene.width);
      const y = Math.floor(fillRandom() * scene.height);
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

export function createRegenerativeMotionFrameRenderer(
  scene: ChallengeScene,
  profile = V16_REGENERATIVE_MOTION_PROFILE,
) {
  const renderOccupancy = createRegenerativeMotionOccupancyRenderer(
    scene,
    profile,
  );
  return (globalFrameIndex: number) => {
    const pixels = new Uint8Array(scene.width * scene.height * 4);
    new Uint32Array(pixels.buffer).fill(BACKGROUND_RGBA32);
    for (const cell of renderOccupancy(globalFrameIndex)) {
      drawSquare(pixels, scene, cell);
    }
    return pixels;
  };
}

export async function renderRegenerativeMotionSegment({
  scene,
  segmentIndex,
  wasmBinary,
  profile = V16_REGENERATIVE_MOTION_PROFILE,
}: {
  scene: ChallengeScene;
  segmentIndex: number;
  wasmBinary: ArrayBuffer;
  profile?: RegenerativeMotionProfile;
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
    renderFrame: createRegenerativeMotionFrameRenderer(scene, profile),
  });
}
