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

## v1.4 dynamic WebM-only experiment

The version archive also exposes a separate `/api/versions/webm-v14/challenge`
flow. It reuses the private session, verification, and one-time proof boundary
while replacing the stable-background renderer with a fresh server-generated
noise field on every frame. The public challenge response contains only an
opaque ID, shape instruction, playback dimensions and timing, expiry, attempt
limit, and the declared VP8/WebM transport.

The segment response is always `video/webm`; WSP1, occupied-cell arrays,
particle identities, mask geometry, radius, trajectory, velocity, and random
seeds are never serialized to the client. This closes the point-stream shortcut
measured against v1.3a/v1.3b. It does not hide the decoded pixels from a client
that records the video, so the next benchmark must operate on the actual
production-codec output.

## v1.5 matched-motion decoy experiment

`/api/versions/webm-v15/challenge` preserves the v1.4 WebM-only and private
verification boundary, but replaces the unique moving target signal with six
coherent clusters: one requested shape and five decoys. The clusters use
similar point counts, radius ranges, persistence, and speeds. Most background
points also move continuously at target-like speeds, while a smaller fraction
renews between frames.

The target and decoy trajectories, particle roles, radius, velocity, seeds,
and hit test remain inside the session-bound server record. The public response
adds only a static `matched-motion-decoys` variant label. This makes simple
frame differencing and global coherent-flow clustering choose among several
plausible regions instead of isolating the target. It deliberately leaves
shape recognition as an attack surface to measure.

## v1.5b human-tuned decoy experiment

`/api/versions/webm-v15b/challenge` keeps the same WebM-only transport,
session-bound private scene, server hit test, and one-time proof model as
v1.5. It changes only the visual profile: one target plus three decoys, at
most 6,200 dots, 58% coherent background motion, and 74–82+ px shapes.
Candidate trajectories are sampled to prefer visible separation during the
first eight seconds.

The public response adds only the static `human-tuned-decoys` label; density,
shape radius, cluster trajectories, and the target identity remain private.
This branch is intentionally not presented as a security improvement. The
24-scene production WebM benchmark measured a 54.2% best adapted attack pass
rate and higher temporal-solver success than v1.5. It exists so the later human
study can measure whether the readability improvement justifies that cost.

## v1.6 regenerative-motion experiment

`/api/versions/webm-v16/challenge` returns to a single requested target while
retaining the WebM-only transport, session-bound private scene, server hit
test, and one-time proof boundary.

Target particles move inside the mask and receive deterministic 4–9 frame
lifetimes. Background particles use the same short lifetime range inside local
80 px vector-field tiles, while 42% regenerate on every frame. Particle
coordinates, lifetimes, tile directions, target mask, and trajectory never
enter the public challenge response; it adds only the static
`regenerative-motion` variant label.

Across 24 production WebM scenes, the best of the seven current local attacks
passed 16.7%, coherent flow passed 0%, tracking passed 8.3%, and the public
shape template passed 4.2%. These figures measure the present solver suite,
not universal resistance. Human readability and stronger learned-video attacks
remain open tests.
