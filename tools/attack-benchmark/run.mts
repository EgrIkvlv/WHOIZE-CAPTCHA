import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { shapeAreaRatio } from "@whoize/captcha-core";
import {
  baselineSolvers,
  createFixture,
  createRasterFixture,
  evaluatePrediction,
  runSolver,
  summarize,
  type SolverResult,
} from "./benchmark-core.ts";
import {
  runClientExposureAudit,
  runReplayProbe,
} from "./security-probes.ts";

const args = new Set(process.argv.slice(2));
const sampleArg = process.argv.find((value) => value.startsWith("--samples="));
const samples = sampleArg ? Math.max(1, Number(sampleArg.split("=")[1])) : 24;
const includeGemini = args.has("--gemini");
const includeRaster = args.has("--raster");
const seedBase = 0x51a7c000;
const results: SolverResult[] = [];
const fixtures = Array.from({ length: samples }, (_, index) =>
  createFixture(seedBase + index * 7919),
);
const representations = includeRaster
  ? [
      { id: "wsp1-exact", fixtures },
      {
        id: "raster-clean",
        fixtures: fixtures.map((fixture) => createRasterFixture(fixture)),
      },
      ...[1.2, 2.4, 4].map((blurPx) => ({
        id: `raster-blur-${blurPx}px`,
        fixtures: fixtures.map((fixture) =>
          createRasterFixture(fixture, blurPx),
        ),
      })),
    ]
  : [{ id: "wsp1-exact", fixtures }];

for (const representation of representations) {
  for (const fixture of representation.fixtures) {
    for (const solver of baselineSolvers) {
      const result = runSolver(solver, fixture);
      results.push({
        ...result,
        attackId: includeRaster
          ? `${representation.id}/${result.attackId}`
          : result.attackId,
      });
    }
  }
}

let gemini:
  | {
      result?: SolverResult;
      model?: string;
      confidence?: number;
      usage?: Record<string, number>;
      error?: string;
    }
  | undefined;

if (includeGemini) {
  const fixture = fixtures[0];
  try {
    const { solveWithGemini } = await import("./gemini-solver.ts");
    const startedAt = performance.now();
    const prediction = await solveWithGemini(fixture);
    const result = evaluatePrediction(
      fixture,
      "gemini-multiframe",
      prediction.prediction,
      prediction.framesUsed,
      0,
      performance.now() - startedAt,
      prediction.notes,
    );
    gemini = {
      result,
      model: prediction.model,
      confidence: prediction.confidence,
      usage: prediction.usage,
    };
    results.push(result);
  } catch (error) {
    gemini = {
      error: error instanceof Error ? error.message : "Unknown Gemini error",
    };
  }
}

const theoreticalRandomRates = fixtures.map((fixture) => {
  const area =
    fixture.scene.radius *
    fixture.scene.radius *
    4 *
    shapeAreaRatio(fixture.scene.shape);
  const single = area / (fixture.scene.width * fixture.scene.height);
  return {
    fixtureId: fixture.id,
    oneAttempt: single,
    threeAttempts: 1 - (1 - single) ** 3,
  };
});
const protocolProbes = {
  clientExposure: await runClientExposureAudit(),
  replay: await runReplayProbe(),
};

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  target: {
    version: "v1.3a/v1.3b",
    format: "WSP1 sparse final frames",
    width: fixtures[0].scene.width,
    height: fixtures[0].scene.height,
    fps: fixtures[0].scene.fps,
    frameCount: fixtures[0].scene.frameCount,
    density: fixtures[0].scene.density,
  },
  methodology: {
    samples,
    syntheticFixtures: true,
    representations: representations.map((item) => item.id),
    seeds: fixtures.map((fixture) => fixture.seed),
    successDefinition: "Predicted point passes the real private shape hit test.",
    timing: "Local wall-clock analysis time; excludes fixture generation.",
    cost: "Algorithmic operation count; Gemini token usage when requested.",
  },
  summaries: summarize(results),
  theoreticalRandomRates,
  protocolProbes,
  gemini,
  runs: results,
};

const outputDirectory = resolve("outputs/attack-benchmark");
await mkdir(outputDirectory, { recursive: true });
const outputPath = resolve(
  outputDirectory,
  `report-${Date.now()}${includeGemini ? "-gemini" : ""}.json`,
);
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.table(
  report.summaries.map((summary) => ({
    attack: summary.attackId,
    success: `${(summary.successRate * 100).toFixed(1)}%`,
    "median error": `${summary.medianCoordinateErrorPx.toFixed(1)} px`,
    frames: summary.medianFramesUsed,
    "median time": `${summary.medianAnalysisMs.toFixed(2)} ms`,
    operations: Math.round(summary.medianOperations).toLocaleString("en-US"),
  })),
);
console.log(
  `Random baseline (3 attempts): ${(
    theoreticalRandomRates.reduce((sum, item) => sum + item.threeAttempts, 0) /
    theoreticalRandomRates.length *
    100
  ).toFixed(2)}% theoretical success.`,
);
if (includeRaster) {
  console.log(
    "Raster note: clean frames are APNG-equivalent after lossless decoding; " +
      "blurred frames model screenshot-only access. WebM is not simulated.",
  );
}
if (gemini?.error) console.error(`Gemini adapter: ${gemini.error}`);
if (gemini?.result) {
  console.log(
    `Gemini ${gemini.model}: ${gemini.result.success ? "PASS" : "MISS"}, ` +
      `${gemini.result.coordinateErrorPx.toFixed(1)} px error, ` +
      `${gemini.result.analysisMs.toFixed(0)} ms.`,
  );
}
console.log(
  `Client exposure audit: ${protocolProbes.clientExposure.passed ? "PASS" : "FAIL"}; ` +
    `exact occupancy stream exposed: ${protocolProbes.clientExposure.exactOccupancyFramesExposed}.`,
);
console.log(
  `Replay probe: ${protocolProbes.replay.passed ? "PASS" : "FAIL"}.`,
);
console.log(`Report: ${outputPath}`);
