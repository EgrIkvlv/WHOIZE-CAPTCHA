"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { MotionPresetName, ShapeName } from "@whoize/captcha-core";

export type Locale = "en" | "ru";

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const STORAGE_KEY = "whoize-locale";
const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== "ru") return;
    const timer = window.setTimeout(() => setLocale("ru"), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale }), [locale]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }
  return context;
}

export function LanguageSwitch() {
  const { locale, setLocale } = useLanguage();
  return (
    <div className="language-switch" aria-label="Language">
      {(["en", "ru"] as const).map((option) => (
        <button
          key={option}
          type="button"
          className={locale === option ? "active" : ""}
          aria-pressed={locale === option}
          onClick={() => setLocale(option)}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

const SHAPE_LABELS: Record<ShapeName, Record<Locale, string>> = {
  Круг: { en: "Circle", ru: "Круг" },
  Треугольник: { en: "Triangle", ru: "Треугольник" },
  Ромб: { en: "Diamond", ru: "Ромб" },
  Звезда: { en: "Star", ru: "Звезда" },
};

const PRESET_LABELS: Record<MotionPresetName, Record<Locale, string>> = {
  Читаемый: { en: "Readable", ru: "Читаемый" },
  Баланс: { en: "Balanced", ru: "Баланс" },
  Предел: { en: "Limit", ru: "Предел" },
  Custom: { en: "Custom", ru: "Свои" },
};

export function shapeLabel(shape: ShapeName, locale: Locale) {
  return SHAPE_LABELS[shape][locale];
}

export function presetLabel(preset: MotionPresetName, locale: Locale) {
  return PRESET_LABELS[preset][locale];
}
