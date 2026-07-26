import {
  inShape,
  shapeAreaRatio,
  type CaptchaConfig,
  type ShapeName,
} from "@whoize/captcha-core";

export const LEGACY_APNG_WIDTH = 384;
export const LEGACY_APNG_HEIGHT = 216;
export const LEGACY_APNG_CYCLE_SECONDS = 3;

export type LegacyPoint = { x: number; y: number };

export type LegacyApngScene = {
  shape: ShapeName;
  radius: number;
  width: number;
  height: number;
  fps: number;
  positions: LegacyPoint[];
  image: Uint8Array;
  effectiveDensity: number;
  effectiveDotSize: number;
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

function randomPointInShape(shape: ShapeName, random: () => number) {
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

function calculatePositions({
  radius,
  speed,
  fps,
  frameCount,
  random,
}: {
  radius: number;
  speed: number;
  fps: number;
  frameCount: number;
  random: () => number;
}) {
  const margin = radius + 11;
  const angle = random() * Math.PI * 2;
  const scale = LEGACY_APNG_WIDTH / 640;
  let x = margin + random() * (LEGACY_APNG_WIDTH - margin * 2);
  let y = margin + random() * (LEGACY_APNG_HEIGHT - margin * 2);
  let velocityX = Math.cos(angle) * speed * scale;
  let velocityY = Math.sin(angle) * speed * scale;
  const positions: LegacyPoint[] = [];

  for (let frame = 0; frame < frameCount; frame += 1) {
    positions.push({ x, y });
    x += velocityX / fps;
    y += velocityY / fps;
    if (x < margin || x > LEGACY_APNG_WIDTH - margin) {
      velocityX *= -1;
      x = Math.max(margin, Math.min(LEGACY_APNG_WIDTH - margin, x));
    }
    if (y < margin || y > LEGACY_APNG_HEIGHT - margin) {
      velocityY *= -1;
      y = Math.max(margin, Math.min(LEGACY_APNG_HEIGHT - margin, y));
    }
  }
  return positions;
}

function drawSquare(
  pixels: Uint8Array,
  x: number,
  y: number,
  size: number,
) {
  const startX = Math.max(0, Math.floor(x));
  const startY = Math.max(0, Math.floor(y));
  const endX = Math.min(LEGACY_APNG_WIDTH, Math.ceil(x + size));
  const endY = Math.min(LEGACY_APNG_HEIGHT, Math.ceil(y + size));
  for (let pixelY = startY; pixelY < endY; pixelY += 1) {
    for (let pixelX = startX; pixelX < endX; pixelX += 1) {
      const offset = (pixelY * LEGACY_APNG_WIDTH + pixelX) * 3;
      pixels[offset] = 16;
      pixels[offset + 1] = 17;
      pixels[offset + 2] = 15;
    }
  }
}

function renderFrames({
  config,
  shape,
  radius,
  positions,
  random,
}: {
  config: CaptchaConfig;
  shape: ShapeName;
  radius: number;
  positions: LegacyPoint[];
  random: () => number;
}) {
  const areaScale =
    (LEGACY_APNG_WIDTH * LEGACY_APNG_HEIGHT) / (640 * 360);
  const density = Math.round(config.density * areaScale);
  const targetRatio =
    (radius * radius * 4 * shapeAreaRatio(shape)) /
    (LEGACY_APNG_WIDTH * LEGACY_APNG_HEIGHT);
  const targetCount = Math.max(70, Math.floor(density * targetRatio));
  const backgroundCount = Math.max(0, density - targetCount);
  const dotSize = Math.max(1, config.dotSize * (LEGACY_APNG_WIDTH / 640));
  const stableTargetPoints = Array.from({ length: targetCount }, () => ({
    ...randomPointInShape(shape, random),
    stable: random() * 100 < config.coherence,
  }));

  return {
    density,
    dotSize,
    frames: positions.map((center) => {
      const pixels = new Uint8Array(
        LEGACY_APNG_WIDTH * LEGACY_APNG_HEIGHT * 3,
      );
      for (let offset = 0; offset < pixels.length; offset += 3) {
        pixels[offset] = 232;
        pixels[offset + 1] = 231;
        pixels[offset + 2] = 225;
      }
      let placed = 0;
      while (placed < backgroundCount) {
        const x = random() * LEGACY_APNG_WIDTH;
        const y = random() * LEGACY_APNG_HEIGHT;
        if (
          !inShape(
            shape,
            (x - center.x) / radius,
            (y - center.y) / radius,
          )
        ) {
          drawSquare(pixels, x, y, dotSize);
          placed += 1;
        }
      }
      for (const point of stableTargetPoints) {
        const current = point.stable
          ? point
          : randomPointInShape(shape, random);
        drawSquare(
          pixels,
          center.x + current.x * radius,
          center.y + current.y * radius,
          dotSize,
        );
      }
      return pixels;
    }),
  };
}

function uint32(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
}

function uint16(value: number) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value);
  return bytes;
}

let crcTable: Uint32Array | null = null;

function crc32(data: Uint8Array) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value =
          value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
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

function chunk(type: string, data: Uint8Array) {
  const typeBytes = new TextEncoder().encode(type);
  const body = concat([typeBytes, data]);
  return concat([uint32(data.length), body, uint32(crc32(body))]);
}

async function deflate(data: Uint8Array) {
  const stream = new Blob([Uint8Array.from(data).buffer]).stream().pipeThrough(
    new CompressionStream("deflate"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function encodeApng(frames: Uint8Array[], fps: number) {
  const parts: Uint8Array[] = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk(
      "IHDR",
      concat([
        uint32(LEGACY_APNG_WIDTH),
        uint32(LEGACY_APNG_HEIGHT),
        new Uint8Array([8, 2, 0, 0, 0]),
      ]),
    ),
    chunk("acTL", concat([uint32(frames.length), uint32(0)])),
  ];
  let sequence = 0;
  for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
    const scanlines = new Uint8Array(
      LEGACY_APNG_HEIGHT * (LEGACY_APNG_WIDTH * 3 + 1),
    );
    for (let y = 0; y < LEGACY_APNG_HEIGHT; y += 1) {
      const targetOffset = y * (LEGACY_APNG_WIDTH * 3 + 1);
      scanlines[targetOffset] = 0;
      scanlines.set(
        frames[frameIndex].subarray(
          y * LEGACY_APNG_WIDTH * 3,
          (y + 1) * LEGACY_APNG_WIDTH * 3,
        ),
        targetOffset + 1,
      );
    }
    parts.push(
      chunk(
        "fcTL",
        concat([
          uint32(sequence++),
          uint32(LEGACY_APNG_WIDTH),
          uint32(LEGACY_APNG_HEIGHT),
          uint32(0),
          uint32(0),
          uint16(1),
          uint16(fps),
          new Uint8Array([0, 0]),
        ]),
      ),
    );
    const compressed = await deflate(scanlines);
    parts.push(
      frameIndex === 0
        ? chunk("IDAT", compressed)
        : chunk("fdAT", concat([uint32(sequence++), compressed])),
    );
  }
  parts.push(chunk("IEND", new Uint8Array()));
  return concat(parts);
}

export async function generateLegacyApngScene(
  config: CaptchaConfig,
  seed: number,
): Promise<LegacyApngScene> {
  const random = mulberry32(seed);
  const shape = chooseShape(config, random);
  const fps = Math.min(16, Math.max(12, config.fps));
  const radiusScale = LEGACY_APNG_WIDTH / 640;
  const radius =
    (config.radiusMin +
      random() * (config.radiusMax - config.radiusMin)) *
    radiusScale;
  const positions = calculatePositions({
    radius,
    speed: config.speed,
    fps,
    frameCount: fps * LEGACY_APNG_CYCLE_SECONDS,
    random,
  });
  const rendered = renderFrames({
    config,
    shape,
    radius,
    positions,
    random,
  });
  return {
    shape,
    radius,
    width: LEGACY_APNG_WIDTH,
    height: LEGACY_APNG_HEIGHT,
    fps,
    positions,
    image: await encodeApng(rendered.frames, fps),
    effectiveDensity: rendered.density,
    effectiveDotSize: rendered.dotSize,
  };
}

export function isLegacyApngHit({
  shape,
  radius,
  positions,
  frameIndex,
  x,
  y,
}: {
  shape: ShapeName;
  radius: number;
  positions: LegacyPoint[];
  frameIndex: number;
  x: number;
  y: number;
}) {
  const center = positions[frameIndex];
  return Boolean(
    center &&
      inShape(shape, (x - center.x) / radius, (y - center.y) / radius),
  );
}
