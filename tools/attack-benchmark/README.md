# WHOIZE attack benchmark

This runner measures reproducible baseline attacks against synthetic
`v1.3a`/`v1.3b` sparse-frame challenges and real locally encoded `v1.4` and
`v1.5` production WebM segments. It never contacts the deployed challenge API
and never stores production answers, proof tokens, sessions, or telemetry.

## Included attacks

1. `random-click` — deterministic no-analysis baseline.
2. `single-frame-density` — densest-window search in one frame.
3. `two-frame-difference` — raw adjacent-frame change map.
4. `temporal-persistence` — repeated coordinates across eight frames.
5. `coherent-flow` — integer optical-flow correlation and local clustering.
6. `multi-frame-tracking` — short track fitted over seven flow observations.
7. `public-shape-template` — sweeps the publicly requested shape over one frame
   without using the private radius or trajectory.
8. `gemini-multiframe` — optional eight-frame multimodal coordinate prediction.
9. `client-code-exposure` — audits client challenge state for direct answer
   fields and records exposure of the exact occupancy stream.
10. `challenge-and-proof-replay` — verifies that solved challenges and
   single-use proofs reject a second use.

Every run records success under the real private shape hit test, coordinate
error, frames used, wall-clock analysis time, and an approximate operation
count. Gemini runs additionally preserve model-reported token usage. API cost
is deliberately left unset because prices change and must be joined against
the current provider price sheet.

## Run

```bash
npm run benchmark:attack
npm run benchmark:attack -- --samples=100
npm run benchmark:attack -- --samples=24 --raster
npm run benchmark:attack -- --samples=24 --webm
npm run benchmark:attack -- --samples=24 --webm-v15 --production-only
```

`--raster` repeats every local solver against five representations of the same
scene: exact WSP1 occupied cells, a clean raster, and raster screenshots with
1.2 px, 2.4 px, and 4 px Gaussian blur. Raster thresholding is included in
solver time. The clean raster is also the correct post-decode model for APNG,
because APNG is lossless.

`--webm` creates one deterministic v1.4 scene per seed and compares exact
pre-encode occupancy cells, a clean raster, 1.2/2.4/4 px raster blur, and the
decoded output of the actual `webm-wasm` VP8 production encoder. The encoded
segment is piped through FFmpeg to gray8 frames; set `FFMPEG_PATH` when
`ffmpeg` is not on `PATH`. The report records encoded bytes, server-side encode
time, decoder time, and solver time separately. The deployed API is never
called.

`--webm-v15` uses identical seeds and target scenes to compare decoded v1.4
and v1.5 production WebM. It also evaluates v1.5 exact, clean-raster, and blur
representations unless `--production-only` is supplied. The production-only
mode is the fastest direct codec comparison and still runs every solver.

Gemini is opt-in and reads secrets only from the process environment:

```bash
node --env-file=/path/to/private.env \
  --experimental-strip-types \
  tools/attack-benchmark/run.mts --samples=1 --gemini
```

Required variable: `GEMINI_API_KEY`. Optional variable:
`GEMINI_MODEL` (defaults to `gemini-3.5-flash`).

Reports are written to ignored `outputs/attack-benchmark/`. Review and
aggregate them before publishing; never commit a report made from production
traffic.

## Interpretation

This benchmark does not claim that a CAPTCHA is “unbreakable.” It compares the
cost and reliability of attacks under explicit assumptions. The CSS blur in
`v1.3b` is a presentation experiment, not a security boundary: browser code can
read the unfiltered Canvas data, so sparse-stream attacks should be assumed to
have the same input as `v1.3a`. The blurred raster cases answer a narrower
counterfactual question: what if an attacker were restricted to screenshots?
The v1.4 and v1.5 WebM cases are different: exact cells are absent from client
state, but decoded pixels remain attacker-controlled input. v1.5 intentionally
converts the problem from locating the only coherent region into recognizing
the requested shape among several motion-matched candidates.
