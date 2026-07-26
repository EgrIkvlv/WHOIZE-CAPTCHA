import { deflateSync } from "node:zlib";
import type {
  BenchmarkFixture,
  Point,
} from "./benchmark-core.ts";

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32(value: number) {
  return Uint8Array.from([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function chunk(type: string, data: Uint8Array) {
  const typeBytes = new TextEncoder().encode(type);
  const checksumInput = new Uint8Array(typeBytes.length + data.length);
  checksumInput.set(typeBytes);
  checksumInput.set(data, typeBytes.length);
  const result = new Uint8Array(12 + data.length);
  result.set(uint32(data.length), 0);
  result.set(typeBytes, 4);
  result.set(data, 8);
  result.set(uint32(crc32(checksumInput)), 8 + data.length);
  return result;
}

function concat(parts: Uint8Array[]) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function framePng(fixture: BenchmarkFixture, frameIndex: number) {
  const { width, height, dotSize } = fixture.stream;
  const pixels = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    pixels[y * (width + 1)] = 0;
    pixels.fill(232, y * (width + 1) + 1, (y + 1) * (width + 1));
  }
  const size = Math.max(1, Math.ceil(dotSize));
  for (const cell of fixture.stream.frames[frameIndex]) {
    const x = cell % width;
    const y = Math.floor(cell / width);
    for (let offsetY = 0; offsetY < size && y + offsetY < height; offsetY += 1) {
      for (let offsetX = 0; offsetX < size && x + offsetX < width; offsetX += 1) {
        pixels[(y + offsetY) * (width + 1) + x + offsetX + 1] = 16;
      }
    }
  }
  const header = new Uint8Array(13);
  header.set(uint32(width), 0);
  header.set(uint32(height), 4);
  header[8] = 8;
  header[9] = 0;
  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return concat([
    signature,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", new Uint8Array()),
  ]);
}

function shapeName(shape: string) {
  if (shape === "Круг") return "circle";
  if (shape === "Треугольник") return "triangle";
  if (shape === "Ромб") return "diamond";
  return "star";
}

export type GeminiSolverResult = {
  prediction: Point;
  confidence: number;
  framesUsed: number;
  usage: Record<string, number>;
  model: string;
  notes: string;
};

export async function solveWithGemini(
  fixture: BenchmarkFixture,
): Promise<GeminiSolverResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const frameIndexes = Array.from({ length: 8 }, (_, index) =>
    Math.round(
      fixture.targetFrame - 14 + (index * 14) / 7,
    ),
  );
  const parts: Array<Record<string, unknown>> = [
    {
      text:
        `These are eight chronological frames from a ${fixture.scene.width}×${fixture.scene.height} motion CAPTCHA. ` +
        `Find the moving ${shapeName(fixture.scene.shape)} in the FINAL frame. ` +
        "Return its center in original pixel coordinates. Do not describe the task.",
    },
  ];
  for (const frameIndex of frameIndexes) {
    parts.push({
      inline_data: {
        mime_type: "image/png",
        data: Buffer.from(framePng(fixture, frameIndex)).toString("base64"),
      },
    });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              x: { type: "NUMBER" },
              y: { type: "NUMBER" },
              confidence: { type: "NUMBER" },
            },
            required: ["x", "y", "confidence"],
          },
        },
      }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${message.slice(0, 240)}`);
  }
  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
    usageMetadata?: Record<string, number>;
  };
  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned no structured prediction");
  const parsed = JSON.parse(text) as {
    x?: unknown;
    y?: unknown;
    confidence?: unknown;
  };
  const x = Number(parsed.x);
  const y = Number(parsed.y);
  const confidence = Number(parsed.confidence);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("Gemini prediction does not contain finite coordinates");
  }
  return {
    prediction: { x, y },
    confidence: Number.isFinite(confidence) ? confidence : 0,
    framesUsed: frameIndexes.length,
    usage: payload.usageMetadata ?? {},
    model,
    notes: "Eight chronological PNG frames; structured coordinate response.",
  };
}

