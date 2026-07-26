# Server-verified reference flow

The public demo uses a server boundary for challenge answers:

1. `POST /api/challenge` creates a session-bound challenge and returns an
   opaque ID plus non-secret playback metadata.
2. `GET /api/challenge/:id/segment/:index` renders a session-bound, one-second
   VP8 WebM segment. Segments share one deterministic trajectory and visual
   seed, so the browser can buffer them as a continuous 640×360, 48 fps stream
   without receiving the mask, center, velocity, or random seeds.
3. `POST /api/challenge/:id/verify` accepts a click coordinate and global video
   frame. The server reconstructs the private position, updates the attempt
   count, and issues a short-lived proof after a hit.
4. `POST /api/demo-action` consumes that proof for the `demo-signup` action.
   Proofs are bound to the session, action, and originating challenge and are
   rejected after expiry or first use.

Challenge records use D1 when the `DB` binding is present, private Vercel Blob
storage on Vercel, and an in-memory adapter for local development and tests.
Video segments are generated on demand and are never persisted. The renderer
uses a temporally stable background field so VP8 can preserve the full dot
density without APNG-sized responses; the target remains perceptible through
relative motion and a frozen frame still contains only a density-matched field.

This boundary prevents trivial answer extraction from the client JavaScript.
It does not make the visual puzzle unbreakable: a solver can still record the
pixel animation and apply optical flow, motion segmentation, or tracking. Rate
limits, adaptive risk policy, production telemetry, and private operational
heuristics remain separate layers.
