import {
  inShape,
  shapeAreaRatio,
  type CaptchaConfig,
  type ShapeName,
} from "@whoize/captcha-core";

export const SPARSE_WIDTH = 640;
export const SPARSE_HEIGHT = 360;
export const SPARSE_LOOP_SECONDS = 4;
export const SPARSE_MIME_TYPE = "application/vnd.whoize.sparse-frames";
export const SPARSE_MAGIC = "WSP1";

export type SparsePoint = { x: number; y: number };

export type SparseScene = {
  shape: ShapeName;
  radius: number;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  density: number;
  dotSize: number;
  coherence: number;
  positions: SparsePoint[];
  visualSeed: number;
};

export type DecodedSparseFrames = {
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  density: number;
  dotSize: number;
  loop: boolean;
  frames: Uint32Array[];
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

function chooseShape(config: CaptchaConfig, random: () => number) {
  const shapes = config.shapes.length
    ? config.shapes
    : (["Круг", "Треугольник", "Ромб", "Звезда"] satisfies ShapeName[]);
  return shapes[Math.floor(random() * shapes.length)];
}

function closedPath({
  random,
  radius,
  speed,
  frameCount,
  durationSeconds,
}: {
  random: () => number;
  radius: number;
  speed: number;
  frameCount: number;
  durationSeconds: number;
}) {
  const verticalRatio = 0.42 + random() * 0.32;
  const normalized = Array.from({ length: frameCount }, (_, frameIndex) => {
    const phase = (frameIndex / frameCount) * Math.PI * 2;
    return {
      x: Math.cos(phase),
      y: Math.sin(phase * 2) * verticalRatio,
    };
  });
  let normalizedLength = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index];
    const next = normalized[(index + 1) % normalized.length];
    normalizedLength += Math.hypot(next.x - current.x, next.y - current.y);
  }
  const scale = (speed * durationSeconds) / normalizedLength;
  const amplitudeX = scale;
  const amplitudeY = scale * verticalRatio;
  const marginX = radius + 18 + amplitudeX;
  const marginY = radius + 18 + amplitudeY;
  const center = {
    x: marginX + random() * (SPARSE_WIDTH - marginX * 2),
    y: marginY + random() * (SPARSE_HEIGHT - marginY * 2),
  };
  return normalized.map((point) => ({
    x: center.x + point.x * scale,
    y: center.y + point.y * scale,
  }));
}

export function generateSparseScene(
  config: CaptchaConfig,
  seed: number,
): SparseScene {
  const random = mulberry32(seed);
  const shape = chooseShape(config, random);
  const radius =
    config.radiusMin + random() * (config.radiusMax - config.radiusMin);
  const frameCount = config.fps * SPARSE_LOOP_SECONDS;
  return {
    shape,
    radius,
    width: SPARSE_WIDTH,
    height: SPARSE_HEIGHT,
    fps: config.fps,
    frameCount,
    density: config.density,
    dotSize: config.dotSize,
    coherence: config.coherence,
    positions: closedPath({
      random,
      radius,
      speed: config.speed,
      frameCount,
      durationSeconds: SPARSE_LOOP_SECONDS,
    }),
    visualSeed: (random() * 0xffffffff) >>> 0,
  };
}

function createSparseFrames(scene: SparseScene) {
  const targetRandom = mulberry32(scene.visualSeed ^ 0xa711);
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

  return scene.positions.map((center, frameIndex) => {
    const occupied = new Set<number>();
    const frameRandom = mulberry32(
      (scene.visualSeed ^ Math.imul(frameIndex + 1, 0x9e3779b1)) >>> 0,
    );

    for (const point of targetPoints) {
      const current = point.stable
        ? point
        : pointInShape(scene.shape, frameRandom);
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
    return Uint32Array.from([...occupied].sort((a, b) => a - b));
  });
}

class BinaryWriter {
  private bytes = new Uint8Array(1_600_000);
  private offset = 0;

  private reserve(length: number) {
    if (this.offset + length <= this.bytes.length) return;
    const next = new Uint8Array(
      Math.max(this.bytes.length * 2, this.offset + length),
    );
    next.set(this.bytes);
    this.bytes = next;
  }

  uint8(value: number) {
    this.reserve(1);
    this.bytes[this.offset] = value;
    this.offset += 1;
  }

  uint16(value: number) {
    this.reserve(2);
    this.bytes[this.offset] = value & 0xff;
    this.bytes[this.offset + 1] = (value >>> 8) & 0xff;
    this.offset += 2;
  }

  ascii(value: string) {
    this.reserve(value.length);
    for (let index = 0; index < value.length; index += 1) {
      this.bytes[this.offset + index] = value.charCodeAt(index);
    }
    this.offset += value.length;
  }

  varint(value: number) {
    let remaining = value >>> 0;
    do {
      let byte = remaining & 0x7f;
      remaining >>>= 7;
      if (remaining) byte |= 0x80;
      this.uint8(byte);
    } while (remaining);
  }

  finish() {
    return this.bytes.slice(0, this.offset);
  }
}

export function encodeSparseFrames(scene: SparseScene) {
  const frames = createSparseFrames(scene);
  const writer = new BinaryWriter();
  writer.ascii(SPARSE_MAGIC);
  writer.uint8(1);
  writer.uint8(1);
  writer.uint16(scene.width);
  writer.uint16(scene.height);
  writer.uint8(scene.fps);
  writer.uint8(Math.round(scene.dotSize * 10));
  writer.uint16(scene.frameCount);
  writer.uint16(scene.density);

  for (const frame of frames) {
    writer.uint16(frame.length);
    let previous = 0;
    for (const cell of frame) {
      writer.varint(cell - previous);
      previous = cell;
    }
  }
  return writer.finish();
}

export function decodeSparseFrames(payload: Uint8Array): DecodedSparseFrames {
  if (
    payload.length < 16 ||
    String.fromCharCode(...payload.subarray(0, 4)) !== SPARSE_MAGIC
  ) {
    throw new Error("Invalid sparse frame stream");
  }
  let offset = 4;
  const version = payload[offset++];
  const flags = payload[offset++];
  if (version !== 1) throw new Error("Unsupported sparse frame version");
  const readUint16 = () => {
    if (offset + 2 > payload.length) throw new Error("Truncated sparse header");
    const value = payload[offset] | (payload[offset + 1] << 8);
    offset += 2;
    return value;
  };
  const width = readUint16();
  const height = readUint16();
  const fps = payload[offset++];
  const dotSize = payload[offset++] / 10;
  const frameCount = readUint16();
  const density = readUint16();
  const frames: Uint32Array[] = [];

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const pointCount = readUint16();
    const frame = new Uint32Array(pointCount);
    let previous = 0;
    for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
      let gap = 0;
      let shift = 0;
      while (true) {
        if (offset >= payload.length) {
          throw new Error("Truncated sparse frame data");
        }
        const byte = payload[offset++];
        gap |= (byte & 0x7f) << shift;
        if (!(byte & 0x80)) break;
        shift += 7;
        if (shift > 28) throw new Error("Invalid sparse frame varint");
      }
      previous += gap;
      if (previous >= width * height) {
        throw new Error("Sparse frame cell is out of bounds");
      }
      frame[pointIndex] = previous;
    }
    frames.push(frame);
  }
  if (offset !== payload.length) throw new Error("Unexpected sparse frame data");
  return {
    width,
    height,
    fps,
    frameCount,
    density,
    dotSize,
    loop: Boolean(flags & 1),
    frames,
  };
}

export function isSparseHit({
  scene,
  frameIndex,
  x,
  y,
}: {
  scene: SparseScene;
  frameIndex: number;
  x: number;
  y: number;
}) {
  if (frameIndex < 0 || frameIndex >= scene.frameCount) return false;
  const center = scene.positions[frameIndex];
  return inShape(
    scene.shape,
    (x - center.x) / scene.radius,
    (y - center.y) / scene.radius,
  );
}
