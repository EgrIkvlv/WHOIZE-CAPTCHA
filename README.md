# WHOIZE CAPTCHA

[![License: MIT](https://img.shields.io/badge/License-MIT-b6f03a.svg)](LICENSE)

An experimental CAPTCHA in which the object is encoded in **time**, not in any
single image.

The prototype renders a field of visually identical random dots. A hidden
shape becomes perceptible only because a subset of those dots maintains
coherent motion across consecutive frames. Freeze the animation and the signal
should collapse back into noise.

> [!WARNING]
> This is a perception experiment and attack-benchmark foundation, not a
> production-ready bot protection system. Do not use it as the only security
> layer.

## The idea

Traditional visual CAPTCHAs place recognizable information directly in an
image. WHOIZE explores a different primitive:

- foreground and background dots share the same color, size, and approximate
  spatial density;
- the background is regenerated continuously;
- dots inside an invisible mask preserve part of their relative position;
- the visual system integrates that correlation over time and perceives a
  moving contour;
- a single frozen frame is intended to contain no reliable representation of
  the answer.

This is closer to a random-dot kinematogram or motion-defined contour than to
an OCR puzzle.

```mermaid
flowchart LR
    A[Uniform random-dot field] --> B[Hidden shape mask]
    B --> C[Temporally coherent particles]
    A --> D[Uncorrelated background particles]
    C --> E[Human perceives a moving contour]
    D --> E
    E --> F[Click inside the perceived shape]
```

## Current prototype

The project now has three connected surfaces:

- `/` — a complete client-side CAPTCHA flow with a protected demo action;
- `/lab` — the original perception laboratory for tuning the signal;
- `/admin` — an authenticated server control plane for shared CAPTCHA
  configuration.

The CAPTCHA surface deliberately tests one core interaction: can a person find
and click one moving shape whose evidence exists primarily between frames?

It includes:

- four procedural masks: circle, triangle, diamond, and star;
- randomized starting position and trajectory;
- exact hit testing against the active mask;
- one click per challenge, a 60-second expiry, and a three-attempt limit;
- explicit playing, verifying, passed, failed, expired, and locked states;
- a local single-use proof demonstrated against a protected signup action;
- a true freeze-frame control;
- optional answer reveal for debugging;
- presets plus controls for density, dot size, signal coherence, speed, and
  frame rate;
- session accuracy, response-time median, and click-error history;
- responsive desktop and mobile layouts.

The control plane can change motion parameters, shape size and availability,
challenge duration, attempt limits, retry timing, local proof lifetime, and
post-success behavior. Draft settings can be tested against the embedded
preview before publication. Published revisions are stored in a private Vercel
Blob, served through a read-only API, and picked up by all CAPTCHA clients
without a rebuild. Writes require an owner password and an authenticated,
signed HttpOnly session. Every publication also creates an immutable audit
record.

The proof and answer verification are still client-side and are intentionally
labelled as such. Moving generation, answers, and proof redemption to the
server is the next security milestone.

## Run locally

Requirements:

- Node.js `>=22.13.0`
- npm

```bash
git clone https://github.com/EgrIkvlv/WHOIZE-CAPTCHA.git
cd WHOIZE-CAPTCHA
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The control plane is
available at [http://localhost:3000/admin](http://localhost:3000/admin).

Server Control Plane variables:

```bash
BLOB_READ_WRITE_TOKEN=
CONTROL_PLANE_PASSWORD=
CONTROL_PLANE_SESSION_SECRET=
```

Keep their values in `.env.local` for development and in encrypted hosting
environment variables for production. Never commit them.

Useful commands:

```bash
npm run dev     # start the interactive lab
npm run lint    # run static checks
npm test        # build and verify server-rendered output
npm run build   # create a production build
```

## How the field is generated

Each trial chooses a mask, radius, position, and velocity. The renderer then
estimates how many particles the mask should contain at the selected global
density.

Background particles are sampled uniformly outside the current mask on every
paint. Target particles are sampled uniformly inside the mask. A configurable
percentage of target particles remains stable relative to the moving center;
the rest is resampled. Those stable particles are the temporal signal.

The canvas never draws a conventional filled silhouette during a normal
challenge. “Show answer” adds an explicit outline only as a laboratory aid.

## What this does—and does not—defend against

The prototype raises the cost of:

- single-screenshot solvers;
- ordinary OCR;
- static image classification;
- bots that do not collect consecutive frames.

It is **not** assumed to resist a purpose-built solver. Likely attacks include:

- frame differencing;
- temporal averaging;
- optical flow;
- motion segmentation;
- coherent-particle clustering;
- object tracking;
- direct analysis or modification of client-side code.

The long-term research question is therefore not “is the animation impossible
for a machine?” It is:

> Can we find parameters that humans solve quickly and reliably while forcing
> automated solvers to perform materially more expensive temporal analysis?

## Planned experiments

1. Record human success rate, response time, and click error across parameter
   combinations.
2. Build baseline solvers using frame differencing and optical flow.
3. Compare frozen-frame, frame-stack, and full-video attacks.
4. Add multiple shapes and target selection.
5. Add “track and click the final position” challenges.
6. Move challenge generation and verification to a server.
7. Add short-lived, single-use proof tokens and rate limiting.
8. Design a non-motion accessibility alternative.

## Production architecture direction

A real deployment must not expose masks, trajectories, or answers in browser
state. The intended direction is server-side generation with short-lived
challenge records and one-time verification tokens.

```mermaid
flowchart LR
    A[Client site] --> B[Challenge API]
    B --> C[Server-side scene generator]
    C --> D[Pixel stream]
    D --> A
    A --> E[Click coordinates]
    E --> F[Server verification]
    F --> G[Single-use proof token]
```

CAPTCHA should remain one signal inside a broader anti-abuse system that also
uses rate limits, session risk, replay prevention, and business-level controls.

## Accessibility

Motion-based challenges can exclude people with low vision, vestibular
disorders, attention differences, or reduced-motion preferences. A production
system needs a genuinely different route—such as email verification, a
passkey, or another account-bound check—not merely an audio version of the same
puzzle.

## Project status

Early research prototype. The visual mechanism and UI are functional; no claim
of bot resistance has been established yet.

Issues, attack ideas, solver experiments, and human-testing results are
welcome.

## License

Released under the [MIT License](LICENSE). You may use, modify, distribute, and
sell copies of the software as long as the copyright and license notice is
preserved.
