"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_CAPTCHA_CONFIG,
  type CaptchaConfig,
} from "@whoize/captcha-core";

export {
  DEFAULT_CAPTCHA_CONFIG,
  getAllShapes,
  MOTION_PRESETS,
  normalizeCaptchaConfig,
  type CaptchaConfig,
  type MotionPresetName,
  type ShapeName,
} from "@whoize/captcha-core";

const listeners = new Set<() => void>();
let currentConfig = DEFAULT_CAPTCHA_CONFIG;
let refreshPromise: Promise<CaptchaConfig> | null = null;
let runtimeStarted = false;

function emitChange() {
  listeners.forEach((listener) => listener());
}

function setCurrentConfig(config: CaptchaConfig) {
  currentConfig = config;
  emitChange();
}

export async function refreshCaptchaConfig() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = fetch("/api/captcha-config", {
    cache: "no-store",
    headers: { accept: "application/json" },
  })
    .then(async (response) => {
      if (!response.ok) throw new Error("Не удалось загрузить серверный конфиг");
      const payload = (await response.json()) as { config: CaptchaConfig };
      setCurrentConfig(payload.config);
      return payload.config;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export async function saveServerCaptchaConfig(config: CaptchaConfig) {
  const response = await fetch("/api/admin/config", {
    method: "PUT",
    cache: "no-store",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      config,
      expectedRevision: config.revision,
    }),
  });
  const payload = (await response.json()) as {
    config?: CaptchaConfig;
    error?: string;
  };
  if (!response.ok || !payload.config) {
    const error = new Error(payload.error ?? "Не удалось сохранить конфиг");
    Object.assign(error, {
      status: response.status,
      currentConfig: payload.config,
    });
    throw error;
  }
  setCurrentConfig(payload.config);
  return payload.config;
}

function startRuntime() {
  if (runtimeStarted || typeof window === "undefined") return;
  runtimeStarted = true;
  void refreshCaptchaConfig().catch(() => undefined);
  const refresh = () => void refreshCaptchaConfig().catch(() => undefined);
  window.addEventListener("focus", refresh);
  window.setInterval(refresh, 30_000);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  startRuntime();
  return () => listeners.delete(listener);
}

export function useCaptchaConfig() {
  return useSyncExternalStore(
    subscribe,
    () => currentConfig,
    () => DEFAULT_CAPTCHA_CONFIG,
  );
}
