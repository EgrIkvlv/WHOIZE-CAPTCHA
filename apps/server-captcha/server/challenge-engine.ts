import {
  inShape,
  shapeAreaRatio,
  type CaptchaConfig,
  type ShapeName,
} from "@whoize/captcha-core";
import createWebmModule from "webm-wasm/dist/webm-wasm.js";

export const CHALLENGE_WIDTH = 640;
export const CHALLENGE_HEIGHT = 360;
export const CHALLENGE_SEGMENT_SECONDS = 1;
export const WEBM_MIME_TYPE = 'video/webm; codecs="vp8"';

const WEBM_BITRATE_KBPS = 3_500;
const DOT_COLOR = [16, 17, 15, 255] as const;
const BACKGROUND_RGBA32 = 0xffe1e7e8;

export type Point = { x: number; y: number };

export type ChallengeScene = {
  shape: ShapeName;
  radius: number;
  width: number;
  height: number;
  fps: number;
  durationFrames: number;
  segmentFrames: number;
  density: number;
  dotSize: number;
  coherence: number;
  start: Point;
  velocity: Point;
  visualSeed: number;
  trajectory?: Point[];
};

type WebmEncoder = {
  addRGBAFrame(frame: Uint8Array): boolean;
  finalize(): boolean;
  lastError(): string;
  delete(): void;
};

type WebmModule = {
  WebmEncoder: new (
    timebaseNum: number,
    timebaseDen: number,
    width: number,
    height: number,
    bitrate: number,
    realtime: boolean,
    live: boolean,
    onChunk: (chunk: ArrayBuffer) => void,
  ) => WebmEncoder;
  then?: unknown;
};

let webmModulePromise: Promise<WebmModule> | null = null;

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

function chooseShape(config: CaptchaConfig, random: () => number) {
  const shapes = config.shapes.length
    ? config.shapes
    : (["Круг", "Треугольник", "Ромб", "Звезда"] satisfies ShapeName[]);
  return shapes[Math.floor(random() * shapes.length)];
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

export function positionAtFrame(scene: ChallengeScene, frameIndex: number) {
  const trajectoryPoint = scene.trajectory?.[
    Math.max(0, Math.min(scene.durationFrames - 1, Math.floor(frameIndex)))
  ];
  if (trajectoryPoint) return trajectoryPoint;

  const margin = scene.radius + 18;
  const seconds = frameIndex / scene.fps;
  return {
    x: reflectedCoordinate(
      scene.start.x,
      scene.velocity.x,
      seconds,
      margin,
      scene.width - margin,
    ),
    y: reflectedCoordinate(
      scene.start.y,
      scene.velocity.y,
      seconds,
      margin,
      scene.height - margin,
    ),
  };
}

function drawSquare(
  pixels: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  size: number,
) {
  const startX = Math.max(0, Math.floor(x));
  const startY = Math.max(0, Math.floor(y));
  const endX = Math.min(width, Math.ceil(x + size));
  const endY = Math.min(height, Math.ceil(y + size));

  for (let pixelY = startY; pixelY < endY; pixelY += 1) {
    for (let pixelX = startX; pixelX < endX; pixelX += 1) {
      const offset = (pixelY * width + pixelX) * 4;
      pixels[offset] = DOT_COLOR[0];
      pixels[offset + 1] = DOT_COLOR[1];
      pixels[offset + 2] = DOT_COLOR[2];
      pixels[offset + 3] = DOT_COLOR[3];
    }
  }
}

function createFrameRenderer(scene: ChallengeScene) {
  const backgroundRandom = mulberry32(scene.visualSeed ^ 0x4b1d);
  const targetRandom = mulberry32(scene.visualSeed ^ 0xa711);
  const backgroundPoints = Array.from({ length: scene.density }, () => ({
    x: backgroundRandom() * scene.width,
    y: backgroundRandom() * scene.height,
  }));
  const targetRatio =
    (scene.radius * scene.radius * 4 * shapeAreaRatio(scene.shape)) /
    (scene.width * scene.height);
  const targetCount = Math.max(
    120,
    Math.floor(scene.density * targetRatio),
  );
  const targetPoints = Array.from({ length: targetCount }, () => ({
    ...pointInShape(scene.shape, targetRandom),
    stable: targetRandom() * 100 < scene.coherence,
  }));

  return (globalFrameIndex: number) => {
    const center = positionAtFrame(scene, globalFrameIndex);
    const pixels = new Uint8Array(scene.width * scene.height * 4);
    new Uint32Array(pixels.buffer).fill(BACKGROUND_RGBA32);

    for (const point of backgroundPoints) {
      if (
        !inShape(
          scene.shape,
          (point.x - center.x) / scene.radius,
          (point.y - center.y) / scene.radius,
        )
      ) {
        drawSquare(
          pixels,
          scene.width,
          scene.height,
          point.x,
          point.y,
          scene.dotSize,
        );
      }
    }

    const frameRandom = mulberry32(
      (scene.visualSeed ^ Math.imul(globalFrameIndex + 1, 0x9e3779b1)) >>> 0,
    );
    for (const point of targetPoints) {
      const current = point.stable
        ? point
        : pointInShape(scene.shape, frameRandom);
      drawSquare(
        pixels,
        scene.width,
        scene.height,
        center.x + current.x * scene.radius,
        center.y + current.y * scene.radius,
        scene.dotSize,
      );
    }
    return pixels;
  };
}

function concat(parts: Uint8Array[]) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

async function getWebmModule(wasmBinary: ArrayBuffer) {
  webmModulePromise ??= new Promise<WebmModule>((resolve, reject) => {
    let encoderModule: WebmModule;
    try {
      // The legacy Emscripten loader assumes CommonJS whenever a runtime
      // exposes `require`. Node-compatible ESM workers expose it without the
      // matching `__dirname`, so provide the harmless value the loader expects.
      const runtimeGlobals = globalThis as typeof globalThis & {
        __dirname?: string;
      };
      runtimeGlobals.__dirname ??= "";
      encoderModule = createWebmModule({
        noInitialRun: true,
        wasmBinary,
        onAbort: reject,
        onRuntimeInitialized() {
          delete encoderModule.then;
          resolve(encoderModule);
        },
      }) as WebmModule;
    } catch (error) {
      reject(error);
    }
  }).catch((error) => {
    webmModulePromise = null;
    throw error;
  });
  return webmModulePromise;
}

export function generateChallengeScene(
  config: CaptchaConfig,
  seed: number,
): ChallengeScene {
  const random = mulberry32(seed);
  const shape = chooseShape(config, random);
  const radius =
    config.radiusMin + random() * (config.radiusMax - config.radiusMin);
  const margin = radius + 18;
  const angle = random() * Math.PI * 2;

  return {
    shape,
    radius,
    width: CHALLENGE_WIDTH,
    height: CHALLENGE_HEIGHT,
    fps: config.fps,
    durationFrames: config.fps * config.durationSeconds,
    segmentFrames: config.fps * CHALLENGE_SEGMENT_SECONDS,
    density: config.density,
    dotSize: config.dotSize,
    coherence: config.coherence,
    start: {
      x: margin + random() * (CHALLENGE_WIDTH - margin * 2),
      y: margin + random() * (CHALLENGE_HEIGHT - margin * 2),
    },
    velocity: {
      x: Math.cos(angle) * config.speed,
      y: Math.sin(angle) * config.speed,
    },
    visualSeed: (random() * 0xffffffff) >>> 0,
  };
}

export async function renderChallengeSegment({
  scene,
  segmentIndex,
  wasmBinary,
}: {
  scene: ChallengeScene;
  segmentIndex: number;
  wasmBinary: ArrayBuffer;
}) {
  const renderFrame = createFrameRenderer(scene);
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
    renderFrame,
  });
}

export async function encodeWebmFrames({
  width,
  height,
  fps,
  firstFrame,
  lastFrame,
  wasmBinary,
  renderFrame,
  bitrateKbps = WEBM_BITRATE_KBPS,
}: {
  width: number;
  height: number;
  fps: number;
  firstFrame: number;
  lastFrame: number;
  wasmBinary: ArrayBuffer;
  renderFrame: (frameIndex: number) => Uint8Array;
  bitrateKbps?: number;
}) {
  const encoderModule = await getWebmModule(wasmBinary);
  const chunks: Uint8Array[] = [];
  const encoder = new encoderModule.WebmEncoder(
    1,
    fps,
    width,
    height,
    bitrateKbps,
    true,
    true,
    (chunk) => chunks.push(new Uint8Array(chunk)),
  );

  try {
    for (
      let frameIndex = firstFrame;
      frameIndex < lastFrame;
      frameIndex += 1
    ) {
      if (!encoder.addRGBAFrame(renderFrame(frameIndex))) {
        throw new Error(encoder.lastError() || "VP8 frame encoding failed");
      }
    }
    if (!encoder.finalize()) {
      throw new Error(encoder.lastError() || "WebM finalization failed");
    }
  } finally {
    encoder.delete();
  }

  return concat(chunks);
}

export function isChallengeHit({
  scene,
  frameIndex,
  x,
  y,
}: {
  scene: ChallengeScene;
  frameIndex: number;
  x: number;
  y: number;
}) {
  if (frameIndex < 0 || frameIndex >= scene.durationFrames) return false;
  const center = positionAtFrame(scene, frameIndex);
  return inShape(
    scene.shape,
    (x - center.x) / scene.radius,
    (y - center.y) / scene.radius,
  );
}
