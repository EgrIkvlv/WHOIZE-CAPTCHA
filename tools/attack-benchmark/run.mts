import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { shapeAreaRatio } from "@whoize/captcha-core";
import {
  baselineSolvers,
  createFixture,
  createRasterFixture,
  createV14Fixture,
  createV15Fixture,
  createV15bFixture,
  evaluatePrediction,
  runSolver,
  summarize,
  type SolverResult,
} from "./benchmark-core.ts";
import {
  runClientExposureAudit,
  runReplayProbe,
  runWebmOnlyExposureAudit,
  runMatchedMotionExposureAudit,
  runHumanTunedExposureAudit,
} from "./security-probes.ts";

const args = new Set(process.argv.slice(2));
const sampleArg = process.argv.find((value) => value.startsWith("--samples="));
const samples = sampleArg ? Math.max(1, Number(sampleArg.split("=")[1])) : 24;
const includeGemini = args.has("--gemini");
const includeRaster = args.has("--raster");
const includeWebm = args.has("--webm");
const includeV15 = args.has("--webm-v15");
const includeV15b = args.has("--webm-v15b");
const productionOnly = args.has("--production-only");
const includeProductionWebm = includeWebm || includeV15 || includeV15b;
const seedBase = 0x51a7c000;
const results: SolverResult[] = [];
const seeds = Array.from(
  { length: samples },
  (_, index) => seedBase + index * 7919,
);
const fixtures = seeds.map((seed) =>
  includeV15b
    ? createV15bFixture(seed)
    : includeV15
    ? createV15Fixture(seed)
    : includeWebm
      ? createV14Fixture(seed)
      : createFixture(seed),
);
const productionWebmFixtures = [];
const comparisonWebmFixtures = [];
if (includeProductionWebm) {
  const { createProductionWebmFixture } = await import(
    "./production-webm.ts"
  );
  for (const seed of seeds) {
    if (includeV15 || includeV15b) {
      comparisonWebmFixtures.push(
        await createProductionWebmFixture(
          seed,
          includeV15b ? "v15" : "v14",
        ),
      );
    }
    productionWebmFixtures.push(
      await createProductionWebmFixture(
        seed,
        includeV15b ? "v15b" : includeV15 ? "v15" : "v14",
      ),
    );
  }
}
const includeRepresentations = includeRaster || includeProductionWebm;
const representations = includeRepresentations
  ? productionOnly && includeProductionWebm
    ? [
        ...(includeV15 || includeV15b
          ? [
              {
                id: includeV15b
                  ? "v15-production-webm-decoded"
                  : "v14-production-webm-decoded",
                fixtures: comparisonWebmFixtures,
              },
            ]
          : []),
        {
          id: includeV15b
            ? "v15b-production-webm-decoded"
            : includeV15
              ? "v15-production-webm-decoded"
            : "production-webm-decoded",
          fixtures: productionWebmFixtures,
        },
      ]
    : [
      {
        id: includeV15b
          ? "v15b-exact-cells"
          : includeV15
            ? "v15-exact-cells"
          : includeWebm
            ? "v14-exact-cells"
            : "wsp1-exact",
        fixtures,
      },
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
      ...(includeProductionWebm
        ? [
            ...(includeV15 || includeV15b
              ? [
                  {
                    id: includeV15b
                      ? "v15-production-webm-decoded"
                      : "v14-production-webm-decoded",
                    fixtures: comparisonWebmFixtures,
                  },
                ]
              : []),
            {
              id: includeV15b
                ? "v15b-production-webm-decoded"
                : includeV15
                  ? "v15-production-webm-decoded"
                : "production-webm-decoded",
              fixtures: productionWebmFixtures,
            },
          ]
        : []),
    ]
  : [{ id: "wsp1-exact", fixtures }];

for (const representation of representations) {
  for (const fixture of representation.fixtures) {
    for (const solver of baselineSolvers) {
      const result = runSolver(solver, fixture);
      results.push({
        ...result,
        attackId: includeRepresentations
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
  webmOnlyExposure: await runWebmOnlyExposureAudit(),
  matchedMotionExposure: await runMatchedMotionExposureAudit(),
  humanTunedExposure: await runHumanTunedExposureAudit(),
  replay: await runReplayProbe(),
};

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

const report = {
  schemaVersion: 3,
  generatedAt: new Date().toISOString(),
  target: {
    version: includeV15b
      ? "v1.5b compared with v1.5"
      : includeV15
        ? "v1.5 compared with v1.4"
      : includeWebm
        ? "v1.4"
        : "v1.3a/v1.3b",
    format: includeV15b
      ? "human-tuned v1.5b compared with v1.5 production VP8/WebM"
      : includeV15
        ? "same-target v1.4 and v1.5 production VP8/WebM plus v1.5 exact/raster representations"
      : includeWebm
        ? "same-scene exact cells, raster, blur, and production VP8/WebM"
      : "WSP1 sparse final frames",
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
    productionOnly,
    seeds: fixtures.map((fixture) => fixture.seed),
    successDefinition: "Predicted point passes the real private shape hit test.",
    timing: "Local wall-clock analysis time; excludes fixture generation.",
    cost: "Algorithmic operation count; Gemini token usage when requested.",
  },
  webmTransport: includeProductionWebm
    ? {
        codec: "production webm-wasm VP8, decoded by FFmpeg to gray8",
        variants: Object.fromEntries(
          [
            ...(includeV15 || includeV15b
              ? [
                  [
                    includeV15b ? "v1.5" : "v1.4",
                    comparisonWebmFixtures,
                  ] as const,
                ]
              : []),
            [
              includeV15b ? "v1.5b" : includeV15 ? "v1.5" : "v1.4",
              productionWebmFixtures,
            ] as const,
          ].map(([version, versionFixtures]) => [
            version,
            {
              medianMediaBytes: median(
                versionFixtures.map(
                  (fixture) => fixture.transportMetrics?.mediaBytes ?? 0,
                ),
              ),
              medianEncodeMs: median(
                versionFixtures.map(
                  (fixture) => fixture.transportMetrics?.encodeMs ?? 0,
                ),
              ),
              medianDecodeMs: median(
                versionFixtures.map(
                  (fixture) => fixture.transportMetrics?.decodeMs ?? 0,
                ),
              ),
            },
          ]),
        ),
      }
    : undefined,
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
  `report-${Date.now()}${includeV15b ? "-webm-v15b" : includeV15 ? "-webm-v15" : includeWebm ? "-webm" : ""}${includeGemini ? "-gemini" : ""}.json`,
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
if (includeProductionWebm && report.webmTransport) {
  for (const [version, metrics] of Object.entries(
    report.webmTransport.variants,
  )) {
    console.log(
      `${version} production WebM: ${Math.round(metrics.medianMediaBytes / 1024)} KiB/segment, ` +
        `${metrics.medianEncodeMs.toFixed(0)} ms encode, ` +
        `${metrics.medianDecodeMs.toFixed(0)} ms decode.`,
    );
  }
} else if (includeRaster) {
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
  `${includeV15b ? "v1.5b human tuned" : includeV15 ? "v1.5 matched motion" : includeWebm ? "v1.4 WebM-only" : "v1.3 sparse"} exposure audit: ${
    (includeV15b
      ? protocolProbes.humanTunedExposure
      : includeV15
        ? protocolProbes.matchedMotionExposure
      : includeWebm
        ? protocolProbes.webmOnlyExposure
      : protocolProbes.clientExposure
    ).passed
      ? "PASS"
      : "FAIL"
  }; exact occupancy stream exposed: ${
    (includeV15b
      ? protocolProbes.humanTunedExposure
      : includeV15
        ? protocolProbes.matchedMotionExposure
      : includeWebm
        ? protocolProbes.webmOnlyExposure
      : protocolProbes.clientExposure
    ).exactOccupancyFramesExposed
  }.`,
);
console.log(
  `Replay probe: ${protocolProbes.replay.passed ? "PASS" : "FAIL"}.`,
);
console.log(`Report: ${outputPath}`);
