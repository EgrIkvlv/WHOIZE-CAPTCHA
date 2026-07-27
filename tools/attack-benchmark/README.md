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
npm run benchmark:attack -- --samples=24 --webm-v15b --production-only
npm run benchmark:attack -- --samples=24 --webm-v16 --production-only
npm run benchmark:attack -- --samples=24 --webm-v16b --production-only
npm run benchmark:attack -- --samples=24 --webm-v17 --production-only
npm run benchmark:attack -- --samples=24 --webm-v18 --production-only
npm run benchmark:v18 -- --samples=24
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

`--webm-v15b` uses identical seeds and target scenes to compare decoded v1.5
and the human-tuned v1.5b production WebM. v1.5b has three rather than five
decoys, fewer dots, less coherent background motion, larger shapes, and
early-path separation. The report includes both transport profiles, every
solver, and a dedicated client-exposure audit. Without `--production-only`,
the runner also evaluates exact, clean-raster, and blurred v1.5b
representations.

`--webm-v16` compares decoded v1.5b and v1.6 production WebM using identical
seeds. The v1.6 renderer has one target, short-lived moving particles inside
the mask, an immediately regenerated background layer, and short local
background flows. The report also runs a dedicated exposure audit for private
particle lifetimes and flow parameters.

`--webm-v16b` compares decoded v1.6 and the readable v1.6b profile using
identical seeds. It measures whether longer target memory restores existing
frame-difference, persistence, flow, tracking, or shape-template attacks and
runs a separate client-exposure audit for the readable profile.

`--webm-v17` compares decoded v1.6b and v1.7 using identical seeds. v1.7 uses
an approximately 18% smaller target, a full private stochastic trajectory,
mixed short- and long-lived target particles, and matching long-lived
background anchors. The report measures the smaller hit area, production
transport, all seven baseline attacks, and a dedicated exposure audit for the
private path and anchor assignments.

`--webm-v18` compares decoded v1.7 and v1.8 using identical seeds. v1.8 uses a
stable requested shape, four target-scale irregular moving blobs, a rapidly
regenerated background, and separate private stochastic paths. It measures the
intentional readability trade against frame difference, flow, tracking, and
the public shape template, plus transport and client exposure.

`benchmark:v18` is the direct family comparison. It evaluates decoded
production WebM for v1.8a with four decoys, decoded production WebM for v1.8b
without decoys, and the exact WSP1 points received by v1.8c. All three use the
same 24 seeds, target scenes, hit tests, and seven baseline attacks. It also
records one-second WebM costs and the complete four-second point payload cost.
For v1.8c it additionally runs `exact-stream-aligned-shape`, which discovers
coherent candidates from exact cells, aligns 24 frame pairs, and classifies the
accumulated target silhouette. The report includes a v1.8c-specific protocol
audit covering session substitution, invalid input, challenge replay, proof
session substitution, and proof replay.

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
the requested shape among several motion-matched candidates. v1.5b deliberately
trades some of that ambiguity for a calmer field; its value cannot be judged
without pairing these bot rates with human completion and error rates.
v1.6 removes stable particle identities rather than adding visible decoy
shapes. Its current baseline result is stronger, but promotion still requires
human and learned-video measurements.
v1.6b deliberately restores a small target/background lifetime asymmetry and
must therefore be evaluated as a paired usability and security result.
