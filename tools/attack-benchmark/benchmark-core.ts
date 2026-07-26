import { performance } from "node:perf_hooks";
import { DEFAULT_CAPTCHA_CONFIG, inShape } from "@whoize/captcha-core";
import {
  decodeSparseFrames,
  encodeSparseFrames,
  generateSparseScene,
  type DecodedSparseFrames,
  type SparseScene,
} from "../../apps/captcha-versions/server/sparse-frames-engine.ts";

export type Point = { x: number; y: number };

export type BenchmarkFixture = {
  id: string;
  seed: number;
  scene: SparseScene;
  stream: DecodedSparseFrames;
  targetFrame: number;
};

export type SolverResult = {
  attackId: string;
  prediction: Point;
  expected: Point;
  success: boolean;
  coordinateErrorPx: number;
  framesUsed: number;
  analysisMs: number;
  operations: number;
  notes: string;
};

export type AttackSummary = {
  attackId: string;
  attempts: number;
  successes: number;
  successRate: number;
  medianAnalysisMs: number;
  medianCoordinateErrorPx: number;
  medianFramesUsed: number;
  medianOperations: number;
};

type Solver = {
  id: string;
  solve: (fixture: BenchmarkFixture) => {
    prediction: Point;
    framesUsed: number;
    operations: number;
    notes: string;
  };
};

function seededRandom(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function frameMask(frame: Uint32Array, size: number) {
  const mask = new Uint8Array(size);
  for (const cell of frame) mask[cell] = 1;
  return mask;
}

function integralImage(
  values: Uint8Array | Uint16Array,
  width: number,
  height: number,
) {
  const stride = width + 1;
  const integral = new Uint32Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let row = 0;
    for (let x = 0; x < width; x += 1) {
      row += values[y * width + x];
      integral[(y + 1) * stride + x + 1] =
        integral[y * stride + x + 1] + row;
    }
  }
  return integral;
}

function rectangleSum(
  integral: Uint32Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  const stride = width + 1;
  return (
    integral[y1 * stride + x1] -
    integral[y0 * stride + x1] -
    integral[y1 * stride + x0] +
    integral[y0 * stride + x0]
  );
}

function scanWindow({
  values,
  width,
  height,
  radius,
  step,
  mode,
}: {
  values: Uint8Array | Uint16Array;
  width: number;
  height: number;
  radius: number;
  step: number;
  mode: "max" | "min";
}) {
  const integral = integralImage(values, width, height);
  let best = mode === "max" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  let point = { x: width / 2, y: height / 2 };
  let operations = width * height;
  for (let y = radius; y < height - radius; y += step) {
    for (let x = radius; x < width - radius; x += step) {
      const score = rectangleSum(
        integral,
        width,
        x - radius,
        y - radius,
        x + radius + 1,
        y + radius + 1,
      );
      operations += 1;
      if (
        (mode === "max" && score > best) ||
        (mode === "min" && score < best)
      ) {
        best = score;
        point = { x, y };
      }
    }
  }
  return { point, score: best, operations };
}

function centroidNear(
  mask: Uint8Array,
  width: number,
  height: number,
  center: Point,
  radius: number,
) {
  let xTotal = 0;
  let yTotal = 0;
  let count = 0;
  const x0 = Math.max(0, Math.floor(center.x - radius));
  const x1 = Math.min(width - 1, Math.ceil(center.x + radius));
  const y0 = Math.max(0, Math.floor(center.y - radius));
  const y1 = Math.min(height - 1, Math.ceil(center.y + radius));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (!mask[y * width + x]) continue;
      xTotal += x;
      yTotal += y;
      count += 1;
    }
  }
  return count ? { x: xTotal / count, y: yTotal / count } : center;
}

function coherentPair(
  first: Uint32Array,
  second: Uint32Array,
  width: number,
  height: number,
) {
  const secondCells = new Set<number>(second);
  let bestDx = 0;
  let bestDy = 0;
  let bestCount = -1;
  let operations = 0;

  for (let dy = -3; dy <= 3; dy += 1) {
    for (let dx = -3; dx <= 3; dx += 1) {
      let count = 0;
      for (const cell of first) {
        const x = cell % width;
        const y = Math.floor(cell / width);
        const nextX = x + dx;
        const nextY = y + dy;
        operations += 1;
        if (
          nextX >= 0 &&
          nextX < width &&
          nextY >= 0 &&
          nextY < height &&
          secondCells.has(nextY * width + nextX)
        ) {
          count += 1;
        }
      }
      if (count > bestCount) {
        bestCount = count;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }

  const matches = new Uint8Array(width * height);
  for (const cell of first) {
    const x = cell % width;
    const y = Math.floor(cell / width);
    const nextX = x + bestDx;
    const nextY = y + bestDy;
    if (
      nextX >= 0 &&
      nextX < width &&
      nextY >= 0 &&
      nextY < height &&
      secondCells.has(nextY * width + nextX)
    ) {
      matches[cell] = 1;
    }
  }
  const scan = scanWindow({
    values: matches,
    width,
    height,
    radius: 72,
    step: 4,
    mode: "max",
  });
  operations += scan.operations + first.length;
  const center = centroidNear(matches, width, height, scan.point, 72);
  return {
    point: { x: center.x + bestDx, y: center.y + bestDy },
    dx: bestDx,
    dy: bestDy,
    operations,
  };
}

function linearPrediction(
  observations: Array<{ frame: number; point: Point }>,
  targetFrame: number,
) {
  const meanFrame =
    observations.reduce((sum, item) => sum + item.frame, 0) /
    observations.length;
  const denominator = observations.reduce(
    (sum, item) => sum + (item.frame - meanFrame) ** 2,
    0,
  );
  const project = (axis: "x" | "y") => {
    const mean =
      observations.reduce((sum, item) => sum + item.point[axis], 0) /
      observations.length;
    const slope = denominator
      ? observations.reduce(
          (sum, item) =>
            sum + (item.frame - meanFrame) * (item.point[axis] - mean),
          0,
        ) / denominator
      : 0;
    return mean + slope * (targetFrame - meanFrame);
  };
  return { x: project("x"), y: project("y") };
}

export function createFixture(seed: number): BenchmarkFixture {
  const scene = generateSparseScene(DEFAULT_CAPTCHA_CONFIG, seed);
  const payload = encodeSparseFrames(scene);
  return {
    id: `sparse-${seed.toString(16).padStart(8, "0")}`,
    seed,
    scene,
    stream: decodeSparseFrames(payload),
    targetFrame: Math.floor(scene.frameCount * 0.37),
  };
}

export const baselineSolvers: Solver[] = [
  {
    id: "random-click",
    solve(fixture) {
      const random = seededRandom(fixture.seed ^ 0x91a7);
      return {
        prediction: {
          x: random() * fixture.scene.width,
          y: random() * fixture.scene.height,
        },
        framesUsed: 0,
        operations: 2,
        notes: "Deterministic random baseline; no frame analysis.",
      };
    },
  },
  {
    id: "single-frame-density",
    solve(fixture) {
      const { width, height } = fixture.stream;
      const mask = frameMask(
        fixture.stream.frames[fixture.targetFrame],
        width * height,
      );
      const scan = scanWindow({
        values: mask,
        width,
        height,
        radius: 68,
        step: 6,
        mode: "max",
      });
      return {
        prediction: centroidNear(mask, width, height, scan.point, 68),
        framesUsed: 1,
        operations: scan.operations,
        notes: "Searches one frame for the densest local window.",
      };
    },
  },
  {
    id: "two-frame-difference",
    solve(fixture) {
      const { width, height, frames } = fixture.stream;
      const current = frameMask(frames[fixture.targetFrame], width * height);
      const previous = frameMask(
        frames[fixture.targetFrame - 1],
        width * height,
      );
      const change = new Uint8Array(width * height);
      for (let index = 0; index < change.length; index += 1) {
        change[index] = current[index] ^ previous[index];
      }
      const scan = scanWindow({
        values: change,
        width,
        height,
        radius: 68,
        step: 6,
        mode: "min",
      });
      return {
        prediction: scan.point,
        framesUsed: 2,
        operations: scan.operations + change.length,
        notes: "Finds the local window with the fewest raw pixel changes.",
      };
    },
  },
  {
    id: "temporal-persistence",
    solve(fixture) {
      const { width, height, frames } = fixture.stream;
      const counts = new Uint16Array(width * height);
      const first = fixture.targetFrame - 7;
      for (let frameIndex = first; frameIndex <= fixture.targetFrame; frameIndex += 1) {
        for (const cell of frames[frameIndex]) counts[cell] += 1;
      }
      const repeated = new Uint16Array(width * height);
      for (let index = 0; index < counts.length; index += 1) {
        repeated[index] = counts[index] > 1 ? counts[index] - 1 : 0;
      }
      const scan = scanWindow({
        values: repeated,
        width,
        height,
        radius: 72,
        step: 4,
        mode: "max",
      });
      return {
        prediction: scan.point,
        framesUsed: 8,
        operations: scan.operations + 8 * fixture.stream.density,
        notes: "Accumulates pixels that persist at the same coordinate.",
      };
    },
  },
  {
    id: "coherent-flow",
    solve(fixture) {
      const { frames, width, height } = fixture.stream;
      const flow = coherentPair(
        frames[fixture.targetFrame - 1],
        frames[fixture.targetFrame],
        width,
        height,
      );
      return {
        prediction: flow.point,
        framesUsed: 2,
        operations: flow.operations,
        notes: `Best integer flow vector (${flow.dx}, ${flow.dy}).`,
      };
    },
  },
  {
    id: "multi-frame-tracking",
    solve(fixture) {
      const { frames, width, height } = fixture.stream;
      const observations: Array<{ frame: number; point: Point }> = [];
      let operations = 0;
      const first = fixture.targetFrame - 6;
      for (let frameIndex = first; frameIndex <= fixture.targetFrame; frameIndex += 1) {
        const flow = coherentPair(
          frames[frameIndex - 1],
          frames[frameIndex],
          width,
          height,
        );
        observations.push({ frame: frameIndex, point: flow.point });
        operations += flow.operations;
      }
      return {
        prediction: linearPrediction(observations, fixture.targetFrame),
        framesUsed: 8,
        operations,
        notes: "Fits a short local track to seven coherent-flow observations.",
      };
    },
  },
];

export function evaluatePrediction(
  fixture: BenchmarkFixture,
  attackId: string,
  prediction: Point,
  framesUsed: number,
  operations: number,
  analysisMs: number,
  notes: string,
): SolverResult {
  const expected = fixture.scene.positions[fixture.targetFrame];
  const coordinateErrorPx = Math.hypot(
    prediction.x - expected.x,
    prediction.y - expected.y,
  );
  return {
    attackId,
    prediction,
    expected,
    success: inShape(
      fixture.scene.shape,
      (prediction.x - expected.x) / fixture.scene.radius,
      (prediction.y - expected.y) / fixture.scene.radius,
    ),
    coordinateErrorPx,
    framesUsed,
    analysisMs,
    operations,
    notes,
  };
}

export function runSolver(solver: Solver, fixture: BenchmarkFixture) {
  const startedAt = performance.now();
  const result = solver.solve(fixture);
  return evaluatePrediction(
    fixture,
    solver.id,
    result.prediction,
    result.framesUsed,
    result.operations,
    performance.now() - startedAt,
    result.notes,
  );
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function summarize(results: SolverResult[]): AttackSummary[] {
  const attackIds = [...new Set(results.map((result) => result.attackId))];
  return attackIds.map((attackId) => {
    const group = results.filter((result) => result.attackId === attackId);
    const successes = group.filter((result) => result.success).length;
    return {
      attackId,
      attempts: group.length,
      successes,
      successRate: successes / group.length,
      medianAnalysisMs: median(group.map((result) => result.analysisMs)),
      medianCoordinateErrorPx: median(
        group.map((result) => result.coordinateErrorPx),
      ),
      medianFramesUsed: median(group.map((result) => result.framesUsed)),
      medianOperations: median(group.map((result) => result.operations)),
    };
  });
}

