import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  baselineSolvers,
  createFixture,
  createRasterFixture,
  createV14Fixture,
  runSolver,
  summarize,
} from "../tools/attack-benchmark/benchmark-core.ts";
import {
  runClientExposureAudit,
  runReplayProbe,
  runWebmOnlyExposureAudit,
} from "../tools/attack-benchmark/security-probes.ts";
import { createProductionWebmFixture } from "../tools/attack-benchmark/production-webm.ts";

const hasFfmpeg =
  spawnSync(process.env.FFMPEG_PATH || "ffmpeg", ["-version"], {
    stdio: "ignore",
  }).status === 0;

test("runs reproducible attack baselines against sparse fixtures", () => {
  const fixture = createFixture(0x51a7c000);
  const results = baselineSolvers.map((solver) => runSolver(solver, fixture));
  assert.equal(results.length, 6);
  assert.ok(
    results.every(
      (result) =>
        Number.isFinite(result.coordinateErrorPx) &&
        Number.isFinite(result.analysisMs) &&
        result.analysisMs >= 0,
    ),
  );
  assert.ok(results.every((result) => result.expected.x > 0));
  assert.ok(results.every((result) => result.expected.y > 0));
  assert.equal(summarize(results).length, 6);
});

test("runs the same attacks on clean and blurred raster-only fixtures", () => {
  const source = createFixture(0x51a7c000);
  for (const fixture of [
    createRasterFixture(source),
    createRasterFixture(source, 1.2),
  ]) {
    const results = baselineSolvers.map((solver) => runSolver(solver, fixture));
    assert.equal(results.length, 6);
    assert.ok(results.every((result) => Number.isFinite(result.analysisMs)));
  }
});

test(
  "decodes the real v1.4 production WebM before running attacks",
  { skip: !hasFfmpeg },
  async () => {
    const exact = createV14Fixture(0x51a7c000);
    const webm = await createProductionWebmFixture(0x51a7c000);
    assert.equal(exact.targetFrame, webm.targetFrame);
    assert.equal(webm.representation, "webm-decoded");
    assert.equal(webm.transportMetrics?.decodedFrames, 48);
    assert.ok((webm.transportMetrics?.mediaBytes ?? 0) > 50_000);
    assert.ok((webm.transportMetrics?.encodeMs ?? 0) > 0);
    assert.ok((webm.transportMetrics?.decodeMs ?? 0) > 0);
    const results = baselineSolvers.map((solver) => runSolver(solver, webm));
    assert.equal(results.length, 6);
    assert.ok(results.every((result) => Number.isFinite(result.analysisMs)));
  },
);

test("coherent temporal solvers beat the one-frame baseline on fixed fixtures", () => {
  const fixtures = Array.from({ length: 6 }, (_, index) =>
    createFixture(0x51a7c000 + index * 7919),
  );
  const results = fixtures.flatMap((fixture) =>
    baselineSolvers.map((solver) => runSolver(solver, fixture)),
  );
  const summaries = new Map(
    summarize(results).map((summary) => [summary.attackId, summary]),
  );
  const single = summaries.get("single-frame-density");
  const flow = summaries.get("coherent-flow");
  const tracking = summaries.get("multi-frame-tracking");
  assert.ok(single);
  assert.ok(flow);
  assert.ok(tracking);
  assert.ok(flow.successRate >= single.successRate);
  assert.ok(tracking.successRate >= single.successRate);
});

test("audits client exposure and rejects challenge and proof replay", async () => {
  const exposure = await runClientExposureAudit();
  assert.equal(exposure.passed, true);
  assert.equal(exposure.exactOccupancyFramesExposed, true);
  assert.deepEqual(exposure.directAnswerFields, []);

  const webmExposure = await runWebmOnlyExposureAudit();
  assert.equal(webmExposure.passed, true);
  assert.equal(webmExposure.exactOccupancyFramesExposed, false);
  assert.deepEqual(webmExposure.exposedPrivateFields, []);

  const replay = await runReplayProbe();
  assert.equal(replay.passed, true);
  assert.equal(replay.challengeReplay.success, false);
  assert.equal(replay.proofReplay.success, false);
});
