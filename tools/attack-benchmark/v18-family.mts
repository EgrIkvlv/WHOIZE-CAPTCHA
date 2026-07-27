import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { DEFAULT_CAPTCHA_CONFIG } from "@whoize/captcha-core";
import {
  createReadableDecoyOccupancyRenderer,
  V18A_READABLE_DECOY_COUNT,
} from "../../apps/captcha-versions/server/readable-decoy-engine.ts";
import { generateReadableDecoyScene } from "../../apps/captcha-versions/server/regenerative-motion-engine.ts";
import { encodeSparseOccupancyFrames } from "../../apps/captcha-versions/server/sparse-frames-engine.ts";
import {
  baselineSolvers,
  createV18cFixture,
  runSolver,
  summarize,
  type BenchmarkFixture,
  type SolverResult,
} from "./benchmark-core.ts";
import { createProductionWebmFixture } from "./production-webm.ts";
import {
  runReadableDecoyExposureAudit,
  runReadablePointExposureAudit,
  runReadableSoloExposureAudit,
} from "./security-probes.ts";

const sampleArg = process.argv.find((value) => value.startsWith("--samples="));
const samples = sampleArg ? Math.max(1, Number(sampleArg.split("=")[1])) : 24;
const seedBase = 0x51a7c000;
const seeds = Array.from(
  { length: samples },
  (_, index) => seedBase + index * 7919,
);

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function runFamily(
  id: string,
  fixtures: BenchmarkFixture[],
  results: SolverResult[],
) {
  for (const fixture of fixtures) {
    for (const solver of baselineSolvers) {
      const result = runSolver(solver, fixture);
      results.push({ ...result, attackId: `${id}/${result.attackId}` });
    }
  }
}

const v18a: BenchmarkFixture[] = [];
const v18b: BenchmarkFixture[] = [];
const v18c: BenchmarkFixture[] = [];
const pointMetrics: Array<{ payloadBytes: number; generationMs: number }> = [];

for (const seed of seeds) {
  v18a.push(await createProductionWebmFixture(seed, "v18a"));
  v18b.push(await createProductionWebmFixture(seed, "v18b"));
  v18c.push(createV18cFixture(seed));

  const scene = generateReadableDecoyScene(DEFAULT_CAPTCHA_CONFIG, seed);
  const render = createReadableDecoyOccupancyRenderer(scene, {
    decoyCount: V18A_READABLE_DECOY_COUNT,
  });
  const startedAt = performance.now();
  const frames = Array.from({ length: scene.fps * 4 }, (_, frameIndex) =>
    Uint32Array.from(
      [...render(frameIndex)].sort((left, right) => left - right),
    ),
  );
  const payload = encodeSparseOccupancyFrames({
    width: scene.width,
    height: scene.height,
    fps: scene.fps,
    dotSize: scene.dotSize,
    density: scene.density,
    frames,
    loop: true,
  });
  pointMetrics.push({
    payloadBytes: payload.byteLength,
    generationMs: performance.now() - startedAt,
  });
}

const results: SolverResult[] = [];
runFamily("v18a-production-webm", v18a, results);
runFamily("v18b-production-webm", v18b, results);
runFamily("v18c-exact-points", v18c, results);

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  target: "v1.8 family transport and decoy comparison",
  methodology: {
    samples,
    seeds,
    attacks: baselineSolvers.map((solver) => solver.id),
    successDefinition: "Predicted point passes the private target shape hit test.",
    v18a: "Production VP8/WebM decoded to gray8; four density-matched decoys.",
    v18b: "Production VP8/WebM decoded to gray8; no decoys.",
    v18c: "Exact four-second WSP1 point stream; four density-matched decoys.",
  },
  transport: {
    v18a: {
      medianBytesPerSecond: median(
        v18a.map((fixture) => fixture.transportMetrics?.mediaBytes ?? 0),
      ),
      medianEncodeMs: median(
        v18a.map((fixture) => fixture.transportMetrics?.encodeMs ?? 0),
      ),
      medianDecodeMs: median(
        v18a.map((fixture) => fixture.transportMetrics?.decodeMs ?? 0),
      ),
    },
    v18b: {
      medianBytesPerSecond: median(
        v18b.map((fixture) => fixture.transportMetrics?.mediaBytes ?? 0),
      ),
      medianEncodeMs: median(
        v18b.map((fixture) => fixture.transportMetrics?.encodeMs ?? 0),
      ),
      medianDecodeMs: median(
        v18b.map((fixture) => fixture.transportMetrics?.decodeMs ?? 0),
      ),
    },
    v18c: {
      medianBytesPerChallenge: median(
        pointMetrics.map((metric) => metric.payloadBytes),
      ),
      medianGenerationMs: median(
        pointMetrics.map((metric) => metric.generationMs),
      ),
      loopSeconds: 4,
    },
  },
  protocolProbes: {
    v18a: await runReadableDecoyExposureAudit(),
    v18b: await runReadableSoloExposureAudit(),
    v18c: await runReadablePointExposureAudit(),
  },
  summaries: summarize(results),
  runs: results,
};

const outputDirectory = resolve("outputs/attack-benchmark");
await mkdir(outputDirectory, { recursive: true });
const outputPath = resolve(
  outputDirectory,
  `report-${Date.now()}-v18-family.json`,
);
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.table(
  report.summaries.map((summary) => ({
    attack: summary.attackId,
    success: `${(summary.successRate * 100).toFixed(1)}%`,
    "median error": `${summary.medianCoordinateErrorPx.toFixed(1)} px`,
    frames: summary.medianFramesUsed,
    "median time": `${summary.medianAnalysisMs.toFixed(2)} ms`,
  })),
);
console.log(
  `v1.8a: ${Math.round(report.transport.v18a.medianBytesPerSecond / 1024)} KiB/s, ` +
    `${report.transport.v18a.medianEncodeMs.toFixed(0)} ms encode.`,
);
console.log(
  `v1.8b: ${Math.round(report.transport.v18b.medianBytesPerSecond / 1024)} KiB/s, ` +
    `${report.transport.v18b.medianEncodeMs.toFixed(0)} ms encode.`,
);
console.log(
  `v1.8c: ${(report.transport.v18c.medianBytesPerChallenge / 1_000_000).toFixed(2)} MB/4 s, ` +
    `${report.transport.v18c.medianGenerationMs.toFixed(0)} ms generation.`,
);
console.log(`Report: ${outputPath}`);
