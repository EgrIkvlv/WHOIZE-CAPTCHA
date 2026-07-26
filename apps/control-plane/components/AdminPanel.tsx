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

type NumericConfigKey = {
  [Key in keyof CaptchaConfig]: CaptchaConfig[Key] extends number ? Key : never;
}[keyof CaptchaConfig];

type SaveState = "clean" | "dirty" | "saving" | "saved" | "error";

const PRESET_NAMES = Object.keys(MOTION_PRESETS) as Array<
  Exclude<MotionPresetName, "Custom">
>;

export function AdminPanel({
  initialConfig,
  initialUpdatedAt,
  storage,
}: {
  initialConfig: CaptchaConfig;
  initialUpdatedAt: string | null;
  storage: "blob" | "memory" | "default";
}) {
  const [draft, setDraft] = useState(initialConfig);
  const [published, setPublished] = useState(initialConfig);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const [saveMessage, setSaveMessage] = useState(
    initialUpdatedAt ? "Серверная версия загружена" : "Работают значения по умолчанию",
  );
  const [previewKey, setPreviewKey] = useState(0);
  const [previewResult, setPreviewResult] = useState("Ожидает решения");

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
    setSaveMessage("Есть неопубликованные изменения");
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
    restartPreview("Preview обновлён");
  };

  const restartPreview = (message = "Ожидает решения") => {
    setPreviewKey((value) => value + 1);
    setPreviewResult(message);
  };

  const publish = async (value = draft) => {
    setSaveState("saving");
    setSaveMessage("Публикуем серверную ревизию…");
    try {
      const saved = await saveServerCaptchaConfig(value);
      setDraft(saved);
      setPublished(saved);
      setUpdatedAt(new Date().toISOString());
      setSaveState("saved");
      setSaveMessage(`Ревизия #${saved.revision} опубликована`);
    } catch (error) {
      const conflict = error as Error & {
        status?: number;
        currentConfig?: CaptchaConfig;
      };
      if (conflict.status === 409 && conflict.currentConfig) {
        setDraft(conflict.currentConfig);
        setPublished(conflict.currentConfig);
        setSaveMessage("Конфиг обновился в другой сессии — загружена новая версия");
      } else {
        setSaveMessage(conflict.message);
      }
      setSaveState("error");
    }
  };

  const resetAll = () => {
    if (!window.confirm("Опубликовать значения CAPTCHA по умолчанию?")) return;
    const defaults = {
      ...DEFAULT_CAPTCHA_CONFIG,
      revision: published.revision,
    };
    setDraft(defaults);
    restartPreview("Preview сброшен");
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
          <form action="/api/admin/logout" method="post">
            <button type="submit">ВЫЙТИ</button>
          </form>
        </div>
      </header>

      <section className="admin-heading">
        <div>
          <p className="admin-eyebrow">OWNER SURFACE · CONFIG V2</p>
          <h1>Управление CAPTCHA</h1>
        </div>
        <div className="admin-scope-card">
          <span>ОБЛАСТЬ ДЕЙСТВИЯ</span>
          <strong>Все посетители</strong>
          <p>
            Опубликованная ревизия хранится на сервере. Новые CAPTCHA получают
            её при загрузке, а открытые вкладки проверяют обновления каждые 30
            секунд.
          </p>
        </div>
      </section>

      <section className="admin-publish-bar">
        <div className={`admin-save-state state-${saveState}`}>
          <i />
          <span>{saveMessage}</span>
        </div>
        <div>
          <small>
            {dirty ? "DRAFT НЕ ОПУБЛИКОВАН" : `LIVE · REV ${published.revision}`}
          </small>
          <button
            type="button"
            disabled={!dirty || saveState === "saving"}
            onClick={() => void publish()}
          >
            {saveState === "saving" ? "ПУБЛИКУЕМ…" : "ОПУБЛИКОВАТЬ →"}
          </button>
        </div>
      </section>

      <section className="admin-workspace">
        <div className="admin-settings">
          <section className="admin-block">
            <BlockTitle
              number="01"
              title="Профиль движения"
              note={`DRAFT / ${draft.profileName.toUpperCase()}`}
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
                  <span>{preset}</span>
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
              title="Модель сигнала"
              note="DRAFT PARAMETERS"
            />
            <div className="admin-control-grid">
              <AdminRange
                label="Плотность"
                value={draft.density}
                min={2200}
                max={7200}
                step={100}
                output={draft.density.toLocaleString("ru-RU")}
                onChange={(value) => updateNumber("density", value, true)}
              />
              <AdminRange
                label="Размер точки"
                value={draft.dotSize}
                min={0.8}
                max={2.4}
                step={0.05}
                output={`${draft.dotSize.toFixed(2)} px`}
                onChange={(value) => updateNumber("dotSize", value, true)}
              />
              <AdminRange
                label="Связность"
                value={draft.coherence}
                min={35}
                max={100}
                step={1}
                output={`${draft.coherence}%`}
                onChange={(value) => updateNumber("coherence", value, true)}
              />
              <AdminRange
                label="Скорость"
                value={draft.speed}
                min={18}
                max={90}
                step={1}
                output={`${draft.speed} px/s`}
                onChange={(value) => updateNumber("speed", value, true)}
              />
              <AdminRange
                label="Частота"
                value={draft.fps}
                min={12}
                max={48}
                step={1}
                output={`${draft.fps} fps`}
                onChange={(value) => updateNumber("fps", value, true)}
              />
              <div className="radius-pair">
                <AdminRange
                  label="Мин. размер"
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
                  label="Макс. размер"
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
              title="Жизненный цикл"
              note="CHALLENGE POLICY"
            />
            <div className="admin-control-grid">
              <AdminRange
                label="Время задачи"
                value={draft.durationSeconds}
                min={15}
                max={180}
                step={5}
                output={`${draft.durationSeconds} sec`}
                onChange={(value) => updateNumber("durationSeconds", value)}
              />
              <AdminRange
                label="Попытки"
                value={draft.maxAttempts}
                min={1}
                max={8}
                step={1}
                output={String(draft.maxAttempts)}
                onChange={(value) => updateNumber("maxAttempts", value)}
              />
              <AdminRange
                label="Пауза после промаха"
                value={draft.retryDelayMs}
                min={300}
                max={3000}
                step={100}
                output={`${draft.retryDelayMs} ms`}
                onChange={(value) => updateNumber("retryDelayMs", value)}
              />
              <AdminRange
                label="Имитация проверки"
                value={draft.verificationDelayMs}
                min={0}
                max={2000}
                step={50}
                output={`${draft.verificationDelayMs} ms`}
                onChange={(value) => updateNumber("verificationDelayMs", value)}
              />
              <AdminRange
                label="Срок proof"
                value={draft.proofTtlSeconds}
                min={15}
                max={600}
                step={15}
                output={`${draft.proofTtlSeconds} sec`}
                onChange={(value) => updateNumber("proofTtlSeconds", value)}
              />
              <AdminRange
                label="Закрытие после успеха"
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
            <BlockTitle number="04" title="Набор фигур" note="OBJECT POOL" />
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
                    <strong>{shape}</strong>
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
              ↻ Перезапустить
            </button>
          </div>
          <div className="admin-preview-frame">
            <MotionCaptcha
              key={previewKey}
              embedded
              config={draft}
              onPass={() => setPreviewResult("Проверка пройдена")}
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
              Запись защищена серверной сессией владельца. Каждая публикация
              создаёт новую ревизию и отдельную запись в журнале. Последнее
              обновление: {formatTimestamp(updatedAt)}.
            </p>
          </div>

          <button className="admin-reset" type="button" onClick={resetAll}>
            Опубликовать значения по умолчанию
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

function formatTimestamp(value: string | null) {
  if (!value) return "ещё не публиковалось";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}
