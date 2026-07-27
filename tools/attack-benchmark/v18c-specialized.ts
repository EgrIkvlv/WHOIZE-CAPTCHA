import { inShape } from "@whoize/captcha-core";
import type {
  BenchmarkFixture,
  Point,
  Solver,
} from "./benchmark-core.ts";

type Candidate = Point & { score: number };

function integralImage(values: Uint8Array, width: number, height: number) {
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

function coherentCandidates(fixture: BenchmarkFixture) {
  const { width, height } = fixture.stream;
  const current = new Set(fixture.stream.frames[fixture.targetFrame]);
  const previous = fixture.stream.frames[fixture.targetFrame - 1];
  const radius = 76;
  const raw: Candidate[] = [];
  let operations = 0;

  for (let dy = -3; dy <= 3; dy += 1) {
    for (let dx = -3; dx <= 3; dx += 1) {
      const matches = new Uint8Array(width * height);
      for (const cell of previous) {
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
          current.has(nextY * width + nextX)
        ) {
          matches[nextY * width + nextX] = 1;
        }
      }
      const integral = integralImage(matches, width, height);
      operations += width * height;
      for (let y = radius; y < height - radius; y += 12) {
        for (let x = radius; x < width - radius; x += 12) {
          raw.push({
            x,
            y,
            score: rectangleSum(
              integral,
              width,
              x - radius,
              y - radius,
              x + radius + 1,
              y + radius + 1,
            ),
          });
          operations += 1;
        }
      }
    }
  }

  raw.sort((left, right) => right.score - left.score);
  const selected: Candidate[] = [];
  for (const candidate of raw) {
    if (
      selected.every(
        (other) => Math.hypot(candidate.x - other.x, candidate.y - other.y) > 82,
      )
    ) {
      selected.push(candidate);
      if (selected.length >= 12) break;
    }
  }
  return { candidates: selected, operations };
}

function scoreTrackedShape(
  fixture: BenchmarkFixture,
  initialCenter: Point,
  framePairs: number,
) {
  const { width } = fixture.stream;
  const binSize = 4;
  const halfSize = 92;
  const binWidth = Math.ceil((halfSize * 2) / binSize);
  const stability = new Uint16Array(binWidth * binWidth);
  let center = { ...initialCenter };
  let operations = 0;

  for (
    let currentFrame = fixture.targetFrame;
    currentFrame > fixture.targetFrame - framePairs;
    currentFrame -= 1
  ) {
    const current = new Set(fixture.stream.frames[currentFrame]);
    const previous = fixture.stream.frames[currentFrame - 1];
    const nearbyPrevious: number[] = [];
    for (const cell of previous) {
      const x = cell % width;
      const y = Math.floor(cell / width);
      if (
        Math.abs(x - center.x) <= halfSize + 3 &&
        Math.abs(y - center.y) <= halfSize + 3
      ) {
        nearbyPrevious.push(cell);
      }
    }
    let bestDx = 0;
    let bestDy = 0;
    let bestCount = -1;

    for (let dy = -3; dy <= 3; dy += 1) {
      for (let dx = -3; dx <= 3; dx += 1) {
        let count = 0;
        for (const cell of nearbyPrevious) {
          const x = cell % width;
          const y = Math.floor(cell / width);
          if (
            Math.abs(x + dx - center.x) > halfSize ||
            Math.abs(y + dy - center.y) > halfSize
          ) {
            continue;
          }
          if (current.has((y + dy) * width + x + dx)) count += 1;
          operations += 1;
        }
        if (count > bestCount) {
          bestCount = count;
          bestDx = dx;
          bestDy = dy;
        }
      }
    }

    for (const cell of nearbyPrevious) {
      const x = (cell % width) + bestDx;
      const y = Math.floor(cell / width) + bestDy;
      if (
        !current.has(y * width + x) ||
        Math.abs(x - center.x) > halfSize ||
        Math.abs(y - center.y) > halfSize
      ) {
        continue;
      }
      const binX = Math.floor((x - center.x + halfSize) / binSize);
      const binY = Math.floor((y - center.y + halfSize) / binSize);
      if (
        binX >= 0 &&
        binX < binWidth &&
        binY >= 0 &&
        binY < binWidth
      ) {
        stability[binY * binWidth + binX] += 1;
      }
    }
    center = { x: center.x - bestDx, y: center.y - bestDy };
  }

  let bestScore = Number.NEGATIVE_INFINITY;
  for (const radius of [54, 60, 66, 72]) {
    let expectedBins = 0;
    let coveredBins = 0;
    let outsideBins = 0;
    let outsideCovered = 0;
    for (let binY = 0; binY < binWidth; binY += 1) {
      for (let binX = 0; binX < binWidth; binX += 1) {
        const x = (binX + 0.5) * binSize - halfSize;
        const y = (binY + 0.5) * binSize - halfSize;
        const normalizedX = x / radius;
        const normalizedY = y / radius;
        const stable =
          stability[binY * binWidth + binX] >=
          Math.max(2, Math.floor(framePairs * 0.18));
        if (inShape(fixture.scene.shape, normalizedX, normalizedY)) {
          expectedBins += 1;
          if (stable) coveredBins += 1;
        } else if (
          Math.abs(normalizedX) <= 1.16 &&
          Math.abs(normalizedY) <= 1.16
        ) {
          outsideBins += 1;
          if (stable) outsideCovered += 1;
        }
        operations += 1;
      }
    }
    const coverage = coveredBins / Math.max(1, expectedBins);
    const spill = outsideCovered / Math.max(1, outsideBins);
    bestScore = Math.max(bestScore, coverage - spill * 1.35);
  }

  return { score: bestScore, operations };
}

export const v18cExactStreamSolvers: Solver[] = [
  {
    id: "exact-stream-aligned-shape",
    solve(fixture) {
      const discovery = coherentCandidates(fixture);
      let best = discovery.candidates[0] ?? {
        x: fixture.stream.width / 2,
        y: fixture.stream.height / 2,
        score: 0,
      };
      let bestShapeScore = Number.NEGATIVE_INFINITY;
      let operations = discovery.operations;
      for (const candidate of discovery.candidates) {
        const shape = scoreTrackedShape(fixture, candidate, 24);
        operations += shape.operations;
        if (shape.score > bestShapeScore) {
          bestShapeScore = shape.score;
          best = candidate;
        }
      }
      return {
        prediction: { x: best.x, y: best.y },
        framesUsed: 25,
        operations,
        notes:
          "Uses exact WSP1 cells to discover coherent regions, align 24 frame pairs, and classify the accumulated public target silhouette.",
      };
    },
  },
];
