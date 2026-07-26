export type ShapeName = "Круг" | "Треугольник" | "Ромб" | "Звезда";
export type MotionPresetName = "Читаемый" | "Баланс" | "Предел" | "Custom";

export type CaptchaConfig = {
  schemaVersion: 1;
  revision: number;
  profileName: MotionPresetName;
  density: number;
  dotSize: number;
  coherence: number;
  speed: number;
  fps: number;
  radiusMin: number;
  radiusMax: number;
  durationSeconds: number;
  maxAttempts: number;
  retryDelayMs: number;
  verificationDelayMs: number;
  proofTtlSeconds: number;
  autoCloseDelayMs: number;
  shapes: ShapeName[];
};

export const ALL_SHAPES: ShapeName[] = [
  "Круг",
  "Треугольник",
  "Ромб",
  "Звезда",
];

export const MOTION_PRESETS: Record<
  Exclude<MotionPresetName, "Custom">,
  Pick<CaptchaConfig, "density" | "dotSize" | "coherence" | "speed" | "fps">
> = {
  Читаемый: {
    density: 7200,
    dotSize: 2.4,
    coherence: 100,
    speed: 52,
    fps: 48,
  },
  Баланс: {
    density: 5200,
    dotSize: 1.35,
    coherence: 76,
    speed: 46,
    fps: 30,
  },
  Предел: {
    density: 6600,
    dotSize: 1.05,
    coherence: 58,
    speed: 34,
    fps: 36,
  },
};

export const DEFAULT_CAPTCHA_CONFIG: CaptchaConfig = {
  schemaVersion: 1,
  revision: 1,
  profileName: "Читаемый",
  ...MOTION_PRESETS.Читаемый,
  radiusMin: 62,
  radiusMax: 72,
  durationSeconds: 60,
  maxAttempts: 3,
  retryDelayMs: 900,
  verificationDelayMs: 380,
  proofTtlSeconds: 60,
  autoCloseDelayMs: 1200,
  shapes: ALL_SHAPES,
};

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

export function normalizeCaptchaConfig(value: unknown): CaptchaConfig {
  if (!value || typeof value !== "object") return DEFAULT_CAPTCHA_CONFIG;
  const raw = value as Partial<CaptchaConfig>;
  const shapes = Array.isArray(raw.shapes)
    ? raw.shapes.filter((shape): shape is ShapeName =>
        ALL_SHAPES.includes(shape as ShapeName),
      )
    : DEFAULT_CAPTCHA_CONFIG.shapes;
  const radiusMin = clamp(raw.radiusMin, 42, 92, DEFAULT_CAPTCHA_CONFIG.radiusMin);
  const radiusMax = clamp(
    raw.radiusMax,
    radiusMin + 2,
    112,
    DEFAULT_CAPTCHA_CONFIG.radiusMax,
  );

  return {
    schemaVersion: 1,
    revision: Math.round(
      clamp(raw.revision, 1, Number.MAX_SAFE_INTEGER, 1),
    ),
    profileName:
      raw.profileName === "Читаемый" ||
      raw.profileName === "Баланс" ||
      raw.profileName === "Предел" ||
      raw.profileName === "Custom"
        ? raw.profileName
        : "Custom",
    density: Math.round(
      clamp(raw.density, 2200, 7200, DEFAULT_CAPTCHA_CONFIG.density),
    ),
    dotSize: clamp(raw.dotSize, 0.8, 2.4, DEFAULT_CAPTCHA_CONFIG.dotSize),
    coherence: Math.round(
      clamp(raw.coherence, 35, 100, DEFAULT_CAPTCHA_CONFIG.coherence),
    ),
    speed: Math.round(
      clamp(raw.speed, 18, 90, DEFAULT_CAPTCHA_CONFIG.speed),
    ),
    fps: Math.round(clamp(raw.fps, 12, 48, DEFAULT_CAPTCHA_CONFIG.fps)),
    radiusMin,
    radiusMax,
    durationSeconds: Math.round(
      clamp(
        raw.durationSeconds,
        15,
        180,
        DEFAULT_CAPTCHA_CONFIG.durationSeconds,
      ),
    ),
    maxAttempts: Math.round(
      clamp(raw.maxAttempts, 1, 8, DEFAULT_CAPTCHA_CONFIG.maxAttempts),
    ),
    retryDelayMs: Math.round(
      clamp(raw.retryDelayMs, 300, 3000, DEFAULT_CAPTCHA_CONFIG.retryDelayMs),
    ),
    verificationDelayMs: Math.round(
      clamp(
        raw.verificationDelayMs,
        0,
        2000,
        DEFAULT_CAPTCHA_CONFIG.verificationDelayMs,
      ),
    ),
    proofTtlSeconds: Math.round(
      clamp(
        raw.proofTtlSeconds,
        15,
        600,
        DEFAULT_CAPTCHA_CONFIG.proofTtlSeconds,
      ),
    ),
    autoCloseDelayMs: Math.round(
      clamp(
        raw.autoCloseDelayMs,
        0,
        5000,
        DEFAULT_CAPTCHA_CONFIG.autoCloseDelayMs,
      ),
    ),
    shapes: shapes.length ? shapes : DEFAULT_CAPTCHA_CONFIG.shapes,
  };
}

export function getAllShapes() {
  return ALL_SHAPES;
}

export function inShape(shape: ShapeName, x: number, y: number) {
  if (shape === "Круг") return x * x + y * y <= 1;
  if (shape === "Ромб") return Math.abs(x) + Math.abs(y) <= 1;
  if (shape === "Треугольник") {
    return y >= -0.92 && y <= 0.72 && Math.abs(x) <= (y + 0.92) / 1.64;
  }

  const angle = Math.atan2(y, x);
  const radius = Math.sqrt(x * x + y * y);
  const segment =
    ((angle + Math.PI * 2 + Math.PI / 2) / (Math.PI / 5)) % 2;
  const edge =
    segment < 1 ? 1 - segment * 0.5 : 0.5 + (segment - 1) * 0.5;
  return radius <= edge;
}

export function shapeAreaRatio(shape: ShapeName) {
  if (shape === "Круг") return Math.PI / 4;
  if (shape === "Ромб" || shape === "Треугольник") return 0.5;
  return 0.42;
}

export function randomPointInShape(shape: ShapeName) {
  let x = 0;
  let y = 0;
  do {
    x = Math.random() * 2 - 1;
    y = Math.random() * 2 - 1;
  } while (!inShape(shape, x, y));
  return { x, y };
}

export function shapeGlyph(shape: ShapeName) {
  if (shape === "Круг") return "●";
  if (shape === "Треугольник") return "▲";
  if (shape === "Ромб") return "◆";
  return "★";
}
