"use client";

import { useSyncExternalStore } from "react";

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

const STORAGE_KEY = "whoize:captcha-config:v1";
const CHANGE_EVENT = "whoize:captcha-config-change";
const ALL_SHAPES: ShapeName[] = ["Круг", "Треугольник", "Ромб", "Звезда"];

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

let cachedRaw: string | null | undefined;
let cachedConfig = DEFAULT_CAPTCHA_CONFIG;

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function normalizeConfig(value: unknown): CaptchaConfig {
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

function getClientSnapshot() {
  if (typeof window === "undefined") return DEFAULT_CAPTCHA_CONFIG;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedConfig;
  cachedRaw = raw;
  try {
    cachedConfig = raw ? normalizeConfig(JSON.parse(raw)) : DEFAULT_CAPTCHA_CONFIG;
  } catch {
    cachedConfig = DEFAULT_CAPTCHA_CONFIG;
  }
  return cachedConfig;
}

function getServerSnapshot() {
  return DEFAULT_CAPTCHA_CONFIG;
}

function subscribe(listener: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      cachedRaw = undefined;
      listener();
    }
  };
  const handleLocalChange = () => {
    cachedRaw = undefined;
    listener();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(CHANGE_EVENT, handleLocalChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(CHANGE_EVENT, handleLocalChange);
  };
}

export function useCaptchaConfig() {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}

export function updateCaptchaConfig(patch: Partial<CaptchaConfig>) {
  if (typeof window === "undefined") return;
  const current = getClientSnapshot();
  const next = normalizeConfig({
    ...current,
    ...patch,
    revision: current.revision + 1,
  });
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  cachedRaw = undefined;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function applyMotionPreset(
  preset: Exclude<MotionPresetName, "Custom">,
) {
  updateCaptchaConfig({
    profileName: preset,
    ...MOTION_PRESETS[preset],
  });
}

export function resetCaptchaConfig() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  cachedRaw = undefined;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function getAllShapes() {
  return ALL_SHAPES;
}
