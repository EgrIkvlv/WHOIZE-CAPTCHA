"use client";

import Link from "next/link";
import { useState } from "react";
import {
  applyMotionPreset,
  getAllShapes,
  type CaptchaConfig,
  type MotionPresetName,
  type ShapeName,
  MOTION_PRESETS,
  resetCaptchaConfig,
  updateCaptchaConfig,
  useCaptchaConfig,
} from "./captcha-config";
import { MotionCaptcha } from "./MotionCaptcha";

type NumericConfigKey = {
  [Key in keyof CaptchaConfig]: CaptchaConfig[Key] extends number ? Key : never;
}[keyof CaptchaConfig];

const PRESET_NAMES = Object.keys(MOTION_PRESETS) as Array<
  Exclude<MotionPresetName, "Custom">
>;

export function AdminPanel() {
  const config = useCaptchaConfig();
  const [previewKey, setPreviewKey] = useState(0);
  const [previewResult, setPreviewResult] = useState("Ожидает решения");

  const updateNumber = (
    key: NumericConfigKey,
    value: number,
    motionSetting = false,
  ) => {
    updateCaptchaConfig({
      [key]: value,
      ...(motionSetting ? { profileName: "Custom" as const } : {}),
    });
  };

  const toggleShape = (shape: ShapeName) => {
    const enabled = config.shapes.includes(shape);
    if (enabled && config.shapes.length === 1) return;
    updateCaptchaConfig({
      shapes: enabled
        ? config.shapes.filter((item) => item !== shape)
        : [...config.shapes, shape],
    });
    setPreviewKey((value) => value + 1);
    setPreviewResult("Конфигурация обновлена");
  };

  const restartPreview = () => {
    setPreviewKey((value) => value + 1);
    setPreviewResult("Ожидает решения");
  };

  const resetAll = () => {
    if (!window.confirm("Сбросить все локальные настройки CAPTCHA?")) return;
    resetCaptchaConfig();
    restartPreview();
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
            LOCAL CONFIG ONLINE
          </span>
          <Link href="/">CAPTCHA</Link>
          <Link href="/lab">MOTION LAB</Link>
        </div>
      </header>

      <section className="admin-heading">
        <div>
          <p className="admin-eyebrow">OWNER SURFACE · CONFIG V1</p>
          <h1>Управление CAPTCHA</h1>
        </div>
        <div className="admin-scope-card">
          <span>ОБЛАСТЬ ДЕЙСТВИЯ</span>
          <strong>Этот браузер</strong>
          <p>
            Настройки сохраняются локально и синхронизируются между открытыми
            вкладками. Серверная Control Plane появится на следующем этапе.
          </p>
        </div>
      </section>

      <section className="admin-workspace">
        <div className="admin-settings">
          <section className="admin-block">
            <BlockTitle
              number="01"
              title="Профиль движения"
              note={`ACTIVE / ${config.profileName.toUpperCase()}`}
            />
            <div className="admin-presets">
              {PRESET_NAMES.map((preset) => (
                <button
                  key={preset}
                  className={config.profileName === preset ? "active" : ""}
                  type="button"
                  onClick={() => {
                    applyMotionPreset(preset);
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
              note="LIVE PARAMETERS"
            />
            <div className="admin-control-grid">
              <AdminRange
                label="Плотность"
                value={config.density}
                min={2200}
                max={7200}
                step={100}
                output={config.density.toLocaleString("ru-RU")}
                onChange={(value) => updateNumber("density", value, true)}
              />
              <AdminRange
                label="Размер точки"
                value={config.dotSize}
                min={0.8}
                max={2.4}
                step={0.05}
                output={`${config.dotSize.toFixed(2)} px`}
                onChange={(value) => updateNumber("dotSize", value, true)}
              />
              <AdminRange
                label="Связность"
                value={config.coherence}
                min={35}
                max={100}
                step={1}
                output={`${config.coherence}%`}
                onChange={(value) => updateNumber("coherence", value, true)}
              />
              <AdminRange
                label="Скорость"
                value={config.speed}
                min={18}
                max={90}
                step={1}
                output={`${config.speed} px/s`}
                onChange={(value) => updateNumber("speed", value, true)}
              />
              <AdminRange
                label="Частота"
                value={config.fps}
                min={12}
                max={48}
                step={1}
                output={`${config.fps} fps`}
                onChange={(value) => updateNumber("fps", value, true)}
              />
              <div className="radius-pair">
                <AdminRange
                  label="Мин. размер"
                  value={config.radiusMin}
                  min={42}
                  max={90}
                  step={1}
                  output={`${config.radiusMin} px`}
                  onChange={(value) =>
                    updateCaptchaConfig({
                      radiusMin: Math.min(value, config.radiusMax - 2),
                      profileName: "Custom",
                    })
                  }
                />
                <AdminRange
                  label="Макс. размер"
                  value={config.radiusMax}
                  min={44}
                  max={112}
                  step={1}
                  output={`${config.radiusMax} px`}
                  onChange={(value) =>
                    updateCaptchaConfig({
                      radiusMax: Math.max(value, config.radiusMin + 2),
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
                value={config.durationSeconds}
                min={15}
                max={180}
                step={5}
                output={`${config.durationSeconds} sec`}
                onChange={(value) =>
                  updateNumber("durationSeconds", value)
                }
              />
              <AdminRange
                label="Попытки"
                value={config.maxAttempts}
                min={1}
                max={8}
                step={1}
                output={String(config.maxAttempts)}
                onChange={(value) => updateNumber("maxAttempts", value)}
              />
              <AdminRange
                label="Пауза после промаха"
                value={config.retryDelayMs}
                min={300}
                max={3000}
                step={100}
                output={`${config.retryDelayMs} ms`}
                onChange={(value) => updateNumber("retryDelayMs", value)}
              />
              <AdminRange
                label="Имитация проверки"
                value={config.verificationDelayMs}
                min={0}
                max={2000}
                step={50}
                output={`${config.verificationDelayMs} ms`}
                onChange={(value) =>
                  updateNumber("verificationDelayMs", value)
                }
              />
              <AdminRange
                label="Срок proof"
                value={config.proofTtlSeconds}
                min={15}
                max={600}
                step={15}
                output={`${config.proofTtlSeconds} sec`}
                onChange={(value) =>
                  updateNumber("proofTtlSeconds", value)
                }
              />
              <AdminRange
                label="Закрытие после успеха"
                value={config.autoCloseDelayMs}
                min={0}
                max={5000}
                step={100}
                output={`${config.autoCloseDelayMs} ms`}
                onChange={(value) =>
                  updateNumber("autoCloseDelayMs", value)
                }
              />
            </div>
          </section>

          <section className="admin-block">
            <BlockTitle number="04" title="Набор фигур" note="OBJECT POOL" />
            <div className="shape-toggles">
              {getAllShapes().map((shape) => {
                const enabled = config.shapes.includes(shape);
                return (
                  <button
                    key={shape}
                    className={enabled ? "enabled" : ""}
                    type="button"
                    onClick={() => toggleShape(shape)}
                    aria-pressed={enabled}
                    disabled={enabled && config.shapes.length === 1}
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
              <span>LIVE PREVIEW</span>
              <strong>{previewResult}</strong>
            </div>
            <button type="button" onClick={restartPreview}>
              ↻ Перезапустить
            </button>
          </div>
          <div className="admin-preview-frame">
            <MotionCaptcha
              key={previewKey}
              embedded
              onPass={() => setPreviewResult("Проверка пройдена")}
            />
          </div>

          <div className="admin-config-meta">
            <div>
              <span>CONFIG REVISION</span>
              <strong>#{String(config.revision).padStart(4, "0")}</strong>
            </div>
            <div>
              <span>STORAGE</span>
              <strong>LOCAL</strong>
            </div>
            <div>
              <span>ACTIVE SHAPES</span>
              <strong>{config.shapes.length}/4</strong>
            </div>
          </div>

          <div className="admin-warning">
            <span>!</span>
            <p>
              Эта версия не является защищённой админкой: любой пользователь с
              доступом к этому браузеру может менять настройки. Для production
              понадобятся персональный вход, серверное хранилище и журнал
              изменений.
            </p>
          </div>

          <button className="admin-reset" type="button" onClick={resetAll}>
            Сбросить конфигурацию к значениям по умолчанию
          </button>
        </aside>
      </section>

      <footer className="admin-footer">
        <p>WHOIZE CONTROL PLANE · LOCAL OWNER SURFACE</p>
        <p>Изменения применяются автоматически</p>
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
