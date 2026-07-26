import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { DEFAULT_CAPTCHA_CONFIG } from "@whoize/captcha-core";
import {
  generateChallengeScene,
} from "../../apps/server-captcha/server/challenge-engine.ts";
import { renderWebmOnlySegment } from "../../apps/captcha-versions/server/webm-only-engine.ts";
import { renderMatchedMotionSegment } from "../../apps/captcha-versions/server/matched-motion-engine.ts";
import {
  createDecodedWebmFixture,
  createV14Fixture,
  createV15Fixture,
  type BenchmarkFixture,
} from "./benchmark-core.ts";

let wasmBinaryPromise: Promise<ArrayBuffer> | null = null;

async function readCodec() {
  wasmBinaryPromise ??= readFile(
    new URL("../../public/codecs/webm-wasm.wasm", import.meta.url),
  ).then((buffer) =>
    buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ),
  );
  return wasmBinaryPromise;
}

function decodeWebmToGray(
  webm: Uint8Array,
  width: number,
  height: number,
) {
  return new Promise<Uint8Array[]>((resolve, reject) => {
    const child = spawn(
      process.env.FFMPEG_PATH || "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "gray",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    child.on("error", (error) => {
      reject(
        new Error(
          `Unable to start FFmpeg. Install ffmpeg or set FFMPEG_PATH. ${error.message}`,
        ),
      );
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `FFmpeg exited with ${code}: ${Buffer.concat(errors).toString("utf8")}`,
          ),
        );
        return;
      }
      const raw = Buffer.concat(output);
      const frameSize = width * height;
      if (!raw.length || raw.length % frameSize !== 0) {
        reject(
          new Error(
            `Decoded WebM has invalid gray8 length ${raw.length} for ${width}×${height}`,
          ),
        );
        return;
      }
      const frames: Uint8Array[] = [];
      for (let offset = 0; offset < raw.length; offset += frameSize) {
        const darkness = new Uint8Array(frameSize);
        for (let index = 0; index < frameSize; index += 1) {
          darkness[index] = 255 - raw[offset + index];
        }
        frames.push(darkness);
      }
      resolve(frames);
    });
    child.stdin.end(webm);
  });
}

export async function createProductionWebmFixture(
  seed: number,
  version: "v14" | "v15" = "v14",
): Promise<BenchmarkFixture> {
  const source =
    version === "v15" ? createV15Fixture(seed) : createV14Fixture(seed);
  const scene = generateChallengeScene(DEFAULT_CAPTCHA_CONFIG, seed);
  const segmentIndex = Math.floor(
    source.targetFrame / scene.segmentFrames,
  );
  const encodeStartedAt = performance.now();
  const webm =
    version === "v15"
      ? await renderMatchedMotionSegment({
          scene,
          segmentIndex,
          wasmBinary: await readCodec(),
        })
      : await renderWebmOnlySegment({
          scene,
          segmentIndex,
          wasmBinary: await readCodec(),
        });
  const encodeMs = performance.now() - encodeStartedAt;
  const decodeStartedAt = performance.now();
  const decodedDarknessFrames = await decodeWebmToGray(
    webm,
    scene.width,
    scene.height,
  );
  const decodeMs = performance.now() - decodeStartedAt;
  if (decodedDarknessFrames.length !== scene.segmentFrames) {
    throw new Error(
      `Expected ${scene.segmentFrames} decoded frames, received ${decodedDarknessFrames.length}`,
    );
  }
  return createDecodedWebmFixture({
    source,
    segmentIndex,
    decodedDarknessFrames,
    mediaBytes: webm.byteLength,
    encodeMs,
    decodeMs,
    decoder: "ffmpeg gray8",
    rasterThreshold: 64,
  });
}
