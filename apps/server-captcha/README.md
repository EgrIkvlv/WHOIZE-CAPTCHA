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

## v1.6b readable-regenerative experiment

`/api/versions/webm-v16b/challenge` is a separate human-first branch. Target
particles live for 8–12 frames and move through a smaller internal range.
Background particles live for 3–8 frames, 48% regenerate immediately, and the
remaining local flow uses smaller 64 px tiles with wider direction variation.

The public response exposes only the `regenerative-readable` label and normal
playback metadata. Target and background lifetimes, flow parameters, mask, and
trajectory remain private.

Across 24 production WebM scenes, the best current attack passed 16.7%.
Frame difference, coherent flow, and tracking each passed 4.2%, while temporal
persistence, density, and the public shape template each reached 16.7%. This
keeps the measured automated result close to v1.6 while deliberately restoring
more temporal evidence for people.

## v1.7 compact stochastic-path experiment

`/api/versions/webm-v17/challenge` keeps the WebM-only and private verification
boundary, but reduces the target radius by approximately 18% and replaces the
reflected linear path with a full server-side stochastic trajectory. Speed and
curvature change smoothly, boundary steering avoids teleports, and no path is
looped back to its start.

Most target particles live 5–9 frames; 30% become 14–20 frame visual anchors.
The background keeps 3–7 frame local flows, 48% immediate regeneration, and
18% 12–18 frame anchors. This gives people sparse stable evidence without
making long lifetime exclusive to the target. The public response contains
only the `stochastic-readable` label and playback metadata; the compact radius,
trajectory, anchor assignments, mask, and hit test stay private.

The first candidate made every target point live 14–20 frames. It was rejected
after coherent flow and tracking each passed 66.7% of 24 production WebM
scenes. The mixed-anchor profile reduced both to 8.3%; temporal persistence is
now the strongest measured attack at 25%. Human testing determines whether the
readability gain is worth that increase over v1.6b.

## v1.8 readable motion-decoy experiment

`/api/versions/webm-v18/challenge` keeps the private stochastic target path,
WebM-only transport, server hit test, and one-time proof flow. Unlike v1.6 and
v1.7, its target points remain stable so the requested 54–68 px geometric
silhouette is intentionally easy for a person to integrate.

Four private irregular blob masks move on independently generated stochastic
paths with comparable radius, speed, persistence, and early separation.
Background points regenerate immediately in 58% of slots; the rest follow
2–5 frame local motion. Public state exposes only the
`readable-motion-decoys` label and playback metadata.

The first small-fragment candidate was rejected because production VP8 made the
stable target a unique low-change window and frame difference passed 95.8% of
24 scenes. Enlarging the decoys to target-scale irregular blobs reduced frame
difference to 29.2%. In the final 24-scene production comparison, flow and
tracking each passed 25% and the public shape template reached 33.3%. The
branch explicitly trades some automated resistance for a visible target.
