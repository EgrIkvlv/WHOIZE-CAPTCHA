# WHOIZE Demo

The public product demo and Motion Lab live here. The root Next.js `app/`
directory is intentionally a thin routing layer so the deployed site remains
compatible with Next.js, Vercel, and Sites.

- `components/CaptchaDemo.tsx` demonstrates the complete local challenge flow.
- `components/CaptchaLab.tsx` exposes research controls and session metrics.

Both surfaces consume the public packages instead of owning CAPTCHA geometry or
rendering logic.
