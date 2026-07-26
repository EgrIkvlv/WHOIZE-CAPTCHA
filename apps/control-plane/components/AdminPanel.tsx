"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MotionCaptcha } from "@whoize/captcha-react";
import {
  DEFAULT_CAPTCHA_CONFIG,
  getAllShapes,
  type CaptchaConfig,
  type MotionPresetName,
  type ShapeName,
  MOTION_PRESETS,
  normalizeCaptchaConfig,
  saveServerCaptchaConfig,
} from "@/app/captcha-config";
import {
  LanguageSwitch,
  presetLabel,
  shapeLabel,
  useLanguage,
} from "@/app/i18n";

type NumericConfigKey = {
  [Key in keyof CaptchaConfig]: CaptchaConfig[Key] extends number ? Key : never;
}[keyof CaptchaConfig];

type SaveState = "clean" | "dirty" | "saving" | "saved" | "error";

const PRESET_NAMES = Object.keys(MOTION_PRESETS) as Array<
  Exclude<MotionPresetName, "Custom">
>;

const COPY = {
  en: {
    loaded: "Server revision loaded",
    defaults: "Using default values",
    dirty: "Unpublished changes",
    previewUpdated: "Preview updated",
    waiting: "Awaiting result",
    publishingRevision: "Publishing server revision…",
    published: (revision: number) => `Revision #${revision} published`,
    conflict: "Config changed in another session—the latest version was loaded",
    saveFailed: "Unable to publish the configuration",
    resetConfirm: "Publish the default CAPTCHA values?",
    previewReset: "Preview reset",
    logout: "SIGN OUT",
    title: "CAPTCHA management",
    scope: "SCOPE",
    allVisitors: "All visitors",
    scopeDescription:
      "The published revision is stored on the server. New CAPTCHA instances load it on startup, while open tabs check for updates every 30 seconds.",
    draftUnpublished: "DRAFT NOT PUBLISHED",
    publishing: "PUBLISHING…",
    publish: "PUBLISH →",
    motionProfile: "Motion profile",
    signalModel: "Signal model",
    density: "Density",
    dotSize: "Dot size",
    coherence: "Coherence",
    speed: "Speed",
    frameRate: "Frame rate",
    minSize: "Min size",
    maxSize: "Max size",
    lifecycle: "Lifecycle",
    challengeTime: "Challenge time",
    attempts: "Attempts",
    retryDelay: "Delay after miss",
    verificationDelay: "Verification simulation",
    proofTtl: "Proof lifetime",
    autoClose: "Close after success",
    shapePool: "Shape pool",
    restart: "↻ Restart",
    previewPassed: "Verification passed",
    serverNote:
      "Writes are protected by the owner's server session. Every publication creates a new revision and a separate audit entry. Last update:",
    resetDefaults: "Publish default values",
    neverPublished: "never published",
  },
  ru: {
    loaded: "Серверная версия загружена",
    defaults: "Работают значения по умолчанию",
    dirty: "Есть неопубликованные изменения",
    previewUpdated: "Preview обновлён",
    waiting: "Ожидает решения",
    publishingRevision: "Публикуем серверную ревизию…",
    published: (revision: number) => `Ревизия #${revision} опубликована`,
    conflict: "Конфиг обновился в другой сессии — загружена новая версия",
    saveFailed: "Не удалось опубликовать конфигурацию",
    resetConfirm: "Опубликовать значения CAPTCHA по умолчанию?",
    previewReset: "Preview сброшен",
    logout: "ВЫЙТИ",
    title: "Управление CAPTCHA",
    scope: "ОБЛАСТЬ ДЕЙСТВИЯ",
    allVisitors: "Все посетители",
    scopeDescription:
      "Опубликованная ревизия хранится на сервере. Новые CAPTCHA получают её при загрузке, а открытые вкладки проверяют обновления каждые 30 секунд.",
    draftUnpublished: "DRAFT НЕ ОПУБЛИКОВАН",
    publishing: "ПУБЛИКУЕМ…",
    publish: "ОПУБЛИКОВАТЬ →",
    motionProfile: "Профиль движения",
    signalModel: "Модель сигнала",
    density: "Плотность",
    dotSize: "Размер точки",
    coherence: "Связность",
    speed: "Скорость",
    frameRate: "Частота",
    minSize: "Мин. размер",
    maxSize: "Макс. размер",
    lifecycle: "Жизненный цикл",
    challengeTime: "Время задачи",
    attempts: "Попытки",
    retryDelay: "Пауза после промаха",
    verificationDelay: "Имитация проверки",
    proofTtl: "Срок proof",
    autoClose: "Закрытие после успеха",
    shapePool: "Набор фигур",
    restart: "↻ Перезапустить",
    previewPassed: "Проверка пройдена",
    serverNote:
      "Запись защищена серверной сессией владельца. Каждая публикация создаёт новую ревизию и отдельную запись в журнале. Последнее обновление:",
    resetDefaults: "Опубликовать значения по умолчанию",
    neverPublished: "ещё не публиковалось",
  },
} as const;

export function AdminPanel({
  initialConfig,
  initialUpdatedAt,
  storage,
}: {
  initialConfig: CaptchaConfig;
  initialUpdatedAt: string | null;
  storage: "blob" | "memory" | "default";
}) {
  const { locale } = useLanguage();
  const copy = COPY[locale];
  const [draft, setDraft] = useState(initialConfig);
  const [published, setPublished] = useState(initialConfig);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const [saveMessage, setSaveMessage] = useState<string>(
    initialUpdatedAt ? COPY.en.loaded : COPY.en.defaults,
  );
  const [previewKey, setPreviewKey] = useState(0);
  const [previewResult, setPreviewResult] = useState<string>(COPY.en.waiting);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(published),
    [draft, published],
  );

  const patchDraft = (patch: Partial<CaptchaConfig>) => {
    setDraft((current) =>
      normalizeCaptchaConfig({
        ...current,
        ...patch,
        revision: current.revision,
      }),
    );
    setSaveState("dirty");
    setSaveMessage(copy.dirty);
  };

  const updateNumber = (
    key: NumericConfigKey,
    value: number,
    motionSetting = false,
  ) => {
    patchDraft({
      [key]: value,
      ...(motionSetting ? { profileName: "Custom" as const } : {}),
    });
  };

  const toggleShape = (shape: ShapeName) => {
    const enabled = draft.shapes.includes(shape);
    if (enabled && draft.shapes.length === 1) return;
    patchDraft({
      shapes: enabled
        ? draft.shapes.filter((item) => item !== shape)
        : [...draft.shapes, shape],
    });
    restartPreview(copy.previewUpdated);
  };

  const restartPreview = (message: string = copy.waiting) => {
    setPreviewKey((value) => value + 1);
    setPreviewResult(message);
  };

  const publish = async (value = draft) => {
    setSaveState("saving");
    setSaveMessage(copy.publishingRevision);
    try {
      const saved = await saveServerCaptchaConfig(value);
      setDraft(saved);
      setPublished(saved);
      setUpdatedAt(new Date().toISOString());
      setSaveState("saved");
      setSaveMessage(copy.published(saved.revision));
    } catch (error) {
      const conflict = error as Error & {
        status?: number;
        currentConfig?: CaptchaConfig;
      };
      if (conflict.status === 409 && conflict.currentConfig) {
        setDraft(conflict.currentConfig);
        setPublished(conflict.currentConfig);
        setSaveMessage(copy.conflict);
      } else {
        setSaveMessage(copy.saveFailed);
      }
      setSaveState("error");
    }
  };

  const resetAll = () => {
    if (!window.confirm(copy.resetConfirm)) return;
    const defaults = {
      ...DEFAULT_CAPTCHA_CONFIG,
      revision: published.revision,
    };
    setDraft(defaults);
    restartPreview(copy.previewReset);
    void publish(defaults);
  };

  return (
    <main className="admin-page">
      <header className="admin-nav">
        <Link className="brand" href="/" aria-label="WHOIZE CAPTCHA">
          WHOIZE<span>/</span>CONTROL PLANE
        </Link>
        <div className="admin-nav-actions">
          <span>
            <i />
            SERVER CONFIG ONLINE
          </span>
          <Link href="/">CAPTCHA</Link>
          <Link href="/lab">MOTION LAB</Link>
          <LanguageSwitch />
          <form action="/api/admin/logout" method="post">
            <button type="submit">{copy.logout}</button>
          </form>
        </div>
      </header>

      <section className="admin-heading">
        <div>
          <p className="admin-eyebrow">OWNER SURFACE · CONFIG V2</p>
          <h1>{copy.title}</h1>
        </div>
        <div className="admin-scope-card">
          <span>{copy.scope}</span>
          <strong>{copy.allVisitors}</strong>
          <p>{copy.scopeDescription}</p>
        </div>
      </section>

      <section className="admin-publish-bar">
        <div className={`admin-save-state state-${saveState}`}>
          <i />
          <span>
            {saveState === "clean"
              ? initialUpdatedAt
                ? copy.loaded
                : copy.defaults
              : saveMessage}
          </span>
        </div>
        <div>
          <small>
            {dirty ? copy.draftUnpublished : `LIVE · REV ${published.revision}`}
          </small>
          <button
            type="button"
            disabled={!dirty || saveState === "saving"}
            onClick={() => void publish()}
          >
            {saveState === "saving" ? copy.publishing : copy.publish}
          </button>
        </div>
      </section>

      <section className="admin-workspace">
        <div className="admin-settings">
          <section className="admin-block">
            <BlockTitle
              number="01"
              title={copy.motionProfile}
              note={`DRAFT / ${presetLabel(draft.profileName, locale).toUpperCase()}`}
            />
            <div className="admin-presets">
              {PRESET_NAMES.map((preset) => (
                <button
                  key={preset}
                  className={draft.profileName === preset ? "active" : ""}
                  type="button"
                  onClick={() => {
                    patchDraft({
                      profileName: preset,
                      ...MOTION_PRESETS[preset],
                    });
                    restartPreview();
                  }}
                >
                  <span>{presetLabel(preset, locale)}</span>
                  <small>
                    {MOTION_PRESETS[preset].density} ·{" "}
                    {MOTION_PRESETS[preset].fps} FPS
                  </small>
                </button>
              ))}
            </div>
          </section>

          <section className="admin-block">
            <BlockTitle
              number="02"
              title={copy.signalModel}
              note="DRAFT PARAMETERS"
            />
            <div className="admin-control-grid">
              <AdminRange
                label={copy.density}
                value={draft.density}
                min={2200}
                max={7200}
                step={100}
                output={draft.density.toLocaleString(
                  locale === "ru" ? "ru-RU" : "en-US",
                )}
                onChange={(value) => updateNumber("density", value, true)}
              />
              <AdminRange
                label={copy.dotSize}
                value={draft.dotSize}
                min={0.8}
                max={2.4}
                step={0.05}
                output={`${draft.dotSize.toFixed(2)} px`}
                onChange={(value) => updateNumber("dotSize", value, true)}
              />
              <AdminRange
                label={copy.coherence}
                value={draft.coherence}
                min={35}
                max={100}
                step={1}
                output={`${draft.coherence}%`}
                onChange={(value) => updateNumber("coherence", value, true)}
              />
              <AdminRange
                label={copy.speed}
                value={draft.speed}
                min={18}
                max={90}
                step={1}
                output={`${draft.speed} px/s`}
                onChange={(value) => updateNumber("speed", value, true)}
              />
              <AdminRange
                label={copy.frameRate}
                value={draft.fps}
                min={12}
                max={48}
                step={1}
                output={`${draft.fps} fps`}
                onChange={(value) => updateNumber("fps", value, true)}
              />
              <div className="radius-pair">
                <AdminRange
                  label={copy.minSize}
                  value={draft.radiusMin}
                  min={42}
                  max={90}
                  step={1}
                  output={`${draft.radiusMin} px`}
                  onChange={(value) =>
                    patchDraft({
                      radiusMin: Math.min(value, draft.radiusMax - 2),
                      profileName: "Custom",
                    })
                  }
                />
                <AdminRange
                  label={copy.maxSize}
                  value={draft.radiusMax}
                  min={44}
                  max={112}
                  step={1}
                  output={`${draft.radiusMax} px`}
                  onChange={(value) =>
                    patchDraft({
                      radiusMax: Math.max(value, draft.radiusMin + 2),
                      profileName: "Custom",
                    })
                  }
                />
              </div>
            </div>
          </section>

          <section className="admin-block">
            <BlockTitle
              number="03"
              title={copy.lifecycle}
              note="CHALLENGE POLICY"
            />
            <div className="admin-control-grid">
              <AdminRange
                label={copy.challengeTime}
                value={draft.durationSeconds}
                min={15}
                max={180}
                step={5}
                output={`${draft.durationSeconds} sec`}
                onChange={(value) => updateNumber("durationSeconds", value)}
              />
              <AdminRange
                label={copy.attempts}
                value={draft.maxAttempts}
                min={1}
                max={8}
                step={1}
                output={String(draft.maxAttempts)}
                onChange={(value) => updateNumber("maxAttempts", value)}
              />
              <AdminRange
                label={copy.retryDelay}
                value={draft.retryDelayMs}
                min={300}
                max={3000}
                step={100}
                output={`${draft.retryDelayMs} ms`}
                onChange={(value) => updateNumber("retryDelayMs", value)}
              />
              <AdminRange
                label={copy.verificationDelay}
                value={draft.verificationDelayMs}
                min={0}
                max={2000}
                step={50}
                output={`${draft.verificationDelayMs} ms`}
                onChange={(value) => updateNumber("verificationDelayMs", value)}
              />
              <AdminRange
                label={copy.proofTtl}
                value={draft.proofTtlSeconds}
                min={15}
                max={600}
                step={15}
                output={`${draft.proofTtlSeconds} sec`}
                onChange={(value) => updateNumber("proofTtlSeconds", value)}
              />
              <AdminRange
                label={copy.autoClose}
                value={draft.autoCloseDelayMs}
                min={0}
                max={5000}
                step={100}
                output={`${draft.autoCloseDelayMs} ms`}
                onChange={(value) => updateNumber("autoCloseDelayMs", value)}
              />
            </div>
          </section>

          <section className="admin-block">
            <BlockTitle number="04" title={copy.shapePool} note="OBJECT POOL" />
            <div className="shape-toggles">
              {getAllShapes().map((shape) => {
                const enabled = draft.shapes.includes(shape);
                return (
                  <button
                    key={shape}
                    className={enabled ? "enabled" : ""}
                    type="button"
                    onClick={() => toggleShape(shape)}
                    aria-pressed={enabled}
                    disabled={enabled && draft.shapes.length === 1}
                  >
                    <span>{shapeGlyph(shape)}</span>
                    <strong>{shapeLabel(shape, locale)}</strong>
                    <small>{enabled ? "ON" : "OFF"}</small>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="admin-preview-column">
          <div className="admin-preview-head">
            <div>
              <span>DRAFT PREVIEW</span>
              <strong>{previewResult}</strong>
            </div>
            <button type="button" onClick={() => restartPreview()}>
              {copy.restart}
            </button>
          </div>
          <div className="admin-preview-frame">
            <MotionCaptcha
              key={previewKey}
              embedded
              config={draft}
              locale={locale}
              onPass={() => setPreviewResult(copy.previewPassed)}
            />
          </div>

          <div className="admin-config-meta">
            <div>
              <span>LIVE REVISION</span>
              <strong>#{String(published.revision).padStart(4, "0")}</strong>
            </div>
            <div>
              <span>STORAGE</span>
              <strong>{storage === "memory" ? "MEMORY" : "BLOB"}</strong>
            </div>
            <div>
              <span>ACTIVE SHAPES</span>
              <strong>{draft.shapes.length}/4</strong>
            </div>
          </div>

          <div className="admin-warning admin-server-note">
            <span>✓</span>
            <p>
              {copy.serverNote} {formatTimestamp(updatedAt, locale, copy.neverPublished)}.
            </p>
          </div>

          <button className="admin-reset" type="button" onClick={resetAll}>
            {copy.resetDefaults}
          </button>
        </aside>
      </section>

      <footer className="admin-footer">
        <p>WHOIZE CONTROL PLANE · SERVER OWNER SURFACE</p>
        <p>Draft → Publish → Global rollout</p>
      </footer>
    </main>
  );
}

function BlockTitle({
  number,
  title,
  note,
}: {
  number: string;
  title: string;
  note: string;
}) {
  return (
    <div className="admin-block-title">
      <span>{number}</span>
      <h2>{title}</h2>
      <small>{note}</small>
    </div>
  );
}

function AdminRange({
  label,
  value,
  min,
  max,
  step,
  output,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  output: string;
  onChange: (value: number) => void;
}) {
  const progress = ((value - min) / (max - min)) * 100;
  return (
    <label className="admin-range">
      <span>
        <strong>{label}</strong>
        <output>{output}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--progress": `${progress}%` } as React.CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function shapeGlyph(shape: ShapeName) {
  if (shape === "Круг") return "●";
  if (shape === "Треугольник") return "▲";
  if (shape === "Ромб") return "◆";
  return "★";
}

function formatTimestamp(
  value: string | null,
  locale: "en" | "ru",
  fallback: string,
) {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}
