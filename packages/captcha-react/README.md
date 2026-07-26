# @whoize/captcha-react

Reusable React rendering and interaction layer for WHOIZE CAPTCHA.

```tsx
import { DEFAULT_CAPTCHA_CONFIG } from "@whoize/captcha-core";
import { MotionCaptcha } from "@whoize/captcha-react";
import "@whoize/captcha-react/styles.css";

<MotionCaptcha
  config={DEFAULT_CAPTCHA_CONFIG}
  locale="en"
  onPass={(proof) => console.log(proof)}
/>;
```

The current proof is intentionally client-side and suitable for research and
demonstration only. A production integration must redeem a server-issued,
single-use proof.
