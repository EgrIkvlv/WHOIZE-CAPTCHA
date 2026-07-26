# React integration

The repository is organized as an npm workspace. The public SDK currently has
two packages:

- `@whoize/captcha-core` — types, presets, normalized configuration, masks, and
  geometry helpers;
- `@whoize/captcha-react` — the reusable React challenge component.

## Local workspace usage

```tsx
import { DEFAULT_CAPTCHA_CONFIG } from "@whoize/captcha-core";
import { MotionCaptcha } from "@whoize/captcha-react";
import "@whoize/captcha-react/styles.css";

export function HumanCheck() {
  return (
    <MotionCaptcha
      config={DEFAULT_CAPTCHA_CONFIG}
      onPass={(localProof) => {
        console.log("Research-only proof:", localProof);
      }}
    />
  );
}
```

The current component intentionally returns a local demonstration proof. Do not
treat it as server-authoritative or use it as the only protection for a real
action.

## Production protocol direction

A production integration will replace the local proof callback with:

1. request a short-lived challenge from WHOIZE Cloud;
2. render only the challenge data needed by the client;
3. submit the interaction result to the verification API;
4. receive a single-use, audience-bound proof;
5. redeem that proof from the protected application backend.

The exact protocol will be versioned and documented before the first hosted
release.
