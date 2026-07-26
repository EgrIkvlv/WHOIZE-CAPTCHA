# Reference Control Plane

This is the open reference implementation used to publish shared research
configuration to the demo.

It contains:

- an owner-authenticated configuration UI;
- configuration read/write API routes;
- a Vercel Blob-backed configuration store with an audit trail.

It does **not** contain production challenge answers, risk scoring, adaptive
anti-bot policy, attack telemetry, or infrastructure secrets. Those capabilities
belong in the future private `WHOIZE-CLOUD` service described in
[`docs/architecture.md`](../../docs/architecture.md).
