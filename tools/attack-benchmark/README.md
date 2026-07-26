# WHOIZE attack benchmark

This runner measures reproducible baseline attacks against synthetic
`v1.3a`/`v1.3b` sparse-frame challenges. It never contacts the production
challenge API and never stores production answers, proof tokens, sessions, or
telemetry.

## Included attacks

1. `random-click` — deterministic no-analysis baseline.
2. `single-frame-density` — densest-window search in one frame.
3. `two-frame-difference` — raw adjacent-frame change map.
4. `temporal-persistence` — repeated coordinates across eight frames.
5. `coherent-flow` — integer optical-flow correlation and local clustering.
6. `multi-frame-tracking` — short track fitted over seven flow observations.
7. `gemini-multiframe` — optional eight-frame multimodal coordinate prediction.
8. `client-code-exposure` — audits client challenge state for direct answer
   fields and records exposure of the exact occupancy stream.
9. `challenge-and-proof-replay` — verifies that solved challenges and
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
```

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
have the same input as `v1.3a`.
