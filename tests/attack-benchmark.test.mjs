import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  baselineSolvers,
  createFixture,
  createRasterFixture,
  createV14Fixture,
  createV15Fixture,
  createV15bFixture,
  createV16Fixture,
  createV16bFixture,
  createV17Fixture,
  createV18Fixture,
  runSolver,
  summarize,
} from "../tools/attack-benchmark/benchmark-core.ts";
import {
  runClientExposureAudit,
  runReplayProbe,
  runWebmOnlyExposureAudit,
  runMatchedMotionExposureAudit,
  runHumanTunedExposureAudit,
  runRegenerativeMotionExposureAudit,
  runReadableRegenerativeExposureAudit,
  runStochasticReadableExposureAudit,
  runReadableDecoyExposureAudit,
} from "../tools/attack-benchmark/security-probes.ts";
import { createProductionWebmFixture } from "../tools/attack-benchmark/production-webm.ts";

const hasFfmpeg =
  spawnSync(process.env.FFMPEG_PATH || "ffmpeg", ["-version"], {
    stdio: "ignore",
  }).status === 0;

test("runs reproducible attack baselines against sparse fixtures", () => {
  const fixture = createFixture(0x51a7c000);
  const results = baselineSolvers.map((solver) => runSolver(solver, fixture));
  assert.equal(results.length, 7);
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
  assert.equal(summarize(results).length, 7);
});

test("keeps the archived v1.5 matched-motion fixture deterministic", () => {
  const fixture = createV15Fixture(0x51a7c000);
  const digest = createHash("sha256");
  for (const frame of fixture.stream.frames) {
    if (frame) {
      digest.update(
        new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength),
      );
    }
  }
  assert.equal(fixture.targetFrame, 129);
  assert.equal(
    digest.digest("hex"),
    "2963f2a73ac8b2c72c9d6636520af90cc4738302b97c862c620340036d0c0d00",
  );
});

test("runs the same attacks on clean and blurred raster-only fixtures", () => {
  const source = createFixture(0x51a7c000);
  for (const fixture of [
    createRasterFixture(source),
    createRasterFixture(source, 1.2),
  ]) {
    const results = baselineSolvers.map((solver) => runSolver(solver, fixture));
    assert.equal(results.length, 7);
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
    assert.equal(results.length, 7);
    assert.ok(results.every((result) => Number.isFinite(result.analysisMs)));
  },
);

test(
  "decodes the real v1.5 production WebM before running attacks",
  { skip: !hasFfmpeg },
  async () => {
    const exact = createV15Fixture(0x51a7c000);
    const webm = await createProductionWebmFixture(0x51a7c000, "v15");
    assert.equal(exact.targetFrame, webm.targetFrame);
    assert.equal(exact.representation, "v15-exact-cells");
    assert.equal(webm.representation, "webm-decoded");
    assert.equal(webm.transportMetrics?.decodedFrames, 48);
    assert.ok((webm.transportMetrics?.mediaBytes ?? 0) > 50_000);
    const results = baselineSolvers.map((solver) => runSolver(solver, webm));
    assert.equal(results.length, 7);
    assert.ok(results.every((result) => Number.isFinite(result.analysisMs)));
  },
);

test(
  "decodes the real v1.5b production WebM before running attacks",
  { skip: !hasFfmpeg },
  async () => {
    const exact = createV15bFixture(0x51a7c000);
    const webm = await createProductionWebmFixture(0x51a7c000, "v15b");
    assert.equal(exact.targetFrame, webm.targetFrame);
    assert.equal(exact.representation, "v15b-exact-cells");
    assert.equal(webm.representation, "webm-decoded");
    assert.equal(webm.transportMetrics?.decodedFrames, 48);
    assert.ok((webm.transportMetrics?.mediaBytes ?? 0) > 50_000);
    const results = baselineSolvers.map((solver) => runSolver(solver, webm));
    assert.equal(results.length, 7);
    assert.ok(results.every((result) => Number.isFinite(result.analysisMs)));
  },
);

test(
  "decodes the real v1.6 production WebM before running attacks",
  { skip: !hasFfmpeg },
  async () => {
    const exact = createV16Fixture(0x51a7c000);
    const webm = await createProductionWebmFixture(0x51a7c000, "v16");
    assert.equal(exact.targetFrame, webm.targetFrame);
    assert.equal(exact.representation, "v16-exact-cells");
    assert.equal(webm.representation, "webm-decoded");
    assert.equal(webm.transportMetrics?.decodedFrames, 48);
    assert.ok((webm.transportMetrics?.mediaBytes ?? 0) > 50_000);
    const results = baselineSolvers.map((solver) => runSolver(solver, webm));
    assert.equal(results.length, 7);
    assert.ok(results.every((result) => Number.isFinite(result.analysisMs)));
  },
);

test(
  "decodes the real v1.6b production WebM before running attacks",
  { skip: !hasFfmpeg },
  async () => {
    const exact = createV16bFixture(0x51a7c000);
    const webm = await createProductionWebmFixture(0x51a7c000, "v16b");
    assert.equal(exact.targetFrame, webm.targetFrame);
    assert.equal(exact.representation, "v16b-exact-cells");
    assert.equal(webm.representation, "webm-decoded");
    assert.equal(webm.transportMetrics?.decodedFrames, 48);
    assert.ok((webm.transportMetrics?.mediaBytes ?? 0) > 50_000);
    const results = baselineSolvers.map((solver) => runSolver(solver, webm));
    assert.equal(results.length, 7);
    assert.ok(results.every((result) => Number.isFinite(result.analysisMs)));
  },
);

test(
  "decodes the real v1.7 production WebM before running attacks",
  { skip: !hasFfmpeg },
  async () => {
    const exact = createV17Fixture(0x51a7c000);
    const webm = await createProductionWebmFixture(0x51a7c000, "v17");
    assert.equal(exact.targetFrame, webm.targetFrame);
    assert.equal(exact.representation, "v17-exact-cells");
    assert.equal(webm.representation, "webm-decoded");
    assert.equal(webm.transportMetrics?.decodedFrames, 48);
    assert.ok((webm.transportMetrics?.mediaBytes ?? 0) > 50_000);
    const results = baselineSolvers.map((solver) => runSolver(solver, webm));
    assert.equal(results.length, 7);
    assert.ok(results.every((result) => Number.isFinite(result.analysisMs)));
  },
);

test(
  "decodes the real v1.8 production WebM before running attacks",
  { skip: !hasFfmpeg },
  async () => {
    const exact = createV18Fixture(0x51a7c000);
    const webm = await createProductionWebmFixture(0x51a7c000, "v18");
    assert.equal(exact.targetFrame, webm.targetFrame);
    assert.equal(exact.representation, "v18-exact-cells");
    assert.equal(webm.representation, "webm-decoded");
    assert.equal(webm.transportMetrics?.decodedFrames, 48);
    assert.ok((webm.transportMetrics?.mediaBytes ?? 0) > 50_000);
    const results = baselineSolvers.map((solver) => runSolver(solver, webm));
    assert.equal(results.length, 7);
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

  const matchedMotionExposure = await runMatchedMotionExposureAudit();
  assert.equal(matchedMotionExposure.passed, true);
  assert.equal(matchedMotionExposure.exactOccupancyFramesExposed, false);
  assert.deepEqual(matchedMotionExposure.exposedPrivateFields, []);

  const humanTunedExposure = await runHumanTunedExposureAudit();
  assert.equal(humanTunedExposure.passed, true);
  assert.equal(humanTunedExposure.exactOccupancyFramesExposed, false);
  assert.deepEqual(humanTunedExposure.exposedPrivateFields, []);

  const regenerativeExposure = await runRegenerativeMotionExposureAudit();
  assert.equal(regenerativeExposure.passed, true);
  assert.equal(regenerativeExposure.exactOccupancyFramesExposed, false);
  assert.deepEqual(regenerativeExposure.exposedPrivateFields, []);

  const readableExposure = await runReadableRegenerativeExposureAudit();
  assert.equal(readableExposure.passed, true);
  assert.equal(readableExposure.exactOccupancyFramesExposed, false);
  assert.deepEqual(readableExposure.exposedPrivateFields, []);

  const stochasticExposure = await runStochasticReadableExposureAudit();
  assert.equal(stochasticExposure.passed, true);
  assert.equal(stochasticExposure.exactOccupancyFramesExposed, false);
  assert.deepEqual(stochasticExposure.exposedPrivateFields, []);

  const readableDecoyExposure = await runReadableDecoyExposureAudit();
  assert.equal(readableDecoyExposure.passed, true);
  assert.equal(readableDecoyExposure.exactOccupancyFramesExposed, false);
  assert.deepEqual(readableDecoyExposure.exposedPrivateFields, []);

  const replay = await runReplayProbe();
  assert.equal(replay.passed, true);
  assert.equal(replay.challengeReplay.success, false);
  assert.equal(replay.proofReplay.success, false);
});
