# Server-verified reference flow

The public demo uses a server boundary for challenge answers:

1. `POST /api/challenge` creates a session-bound challenge and returns an
   animated PNG. Metadata is limited to an opaque challenge ID, the requested
   shape name, dimensions, frame timing, expiry, and attempt limit.
2. `POST /api/challenge/:id/verify` accepts a click coordinate and animation
   frame. The server reads the private mask and trajectory, updates the attempt
   count, and issues a short-lived proof after a hit.
3. `POST /api/demo-action` consumes that proof for the `demo-signup` action.
   Proofs are bound to the session, action, and originating challenge and are
   rejected after expiry or first use.

Challenge records use D1 when the `DB` binding is present, private Vercel Blob
storage on Vercel, and an in-memory adapter for local development and tests.
The animated pixel response is generated directly and is never persisted.

This boundary prevents trivial answer extraction from the client JavaScript.
It does not make the visual puzzle unbreakable: a solver can still record the
pixel animation and apply optical flow, motion segmentation, or tracking. Rate
limits, adaptive risk policy, production telemetry, and private operational
heuristics remain separate layers.
