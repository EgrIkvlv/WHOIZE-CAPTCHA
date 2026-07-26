"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  inShape,
  randomPointInShape as randomShapePoint,
  shapeAreaRatio,
  shapeGlyph,
  type ShapeName,
} from "@whoize/captcha-core";
import {
  LanguageSwitch,
  presetLabel,
  shapeLabel,
  useLanguage,
} from "@/app/i18n";

type Difficulty = "Читаемый" | "Баланс" | "Предел";

type LabConfig = {
  density: number;
  dotSize: number;
  coherence: number;
  speed: number;
  refreshRate: number;
};

type Point = { x: number; y: number; stable: boolean };
type Attempt = {
  id: number;
  shape: ShapeName;
  hit: boolean;
  time: number;
  error: number;
};
type LabMessage =
  | { kind: "search" }
  | { kind: "frozen" }
  | { kind: "resumed" }
  | { kind: "result"; hit: boolean; elapsed: number; error: number };

const WIDTH = 760;
const HEIGHT = 430;
const SHAPES: ShapeName[] = ["Круг", "Треугольник", "Ромб", "Звезда"];

const PRESETS: Record<Difficulty, LabConfig> = {
  Читаемый: {
    density: 7200,
    dotSize: 2.4,
    coherence: 100,
    speed: 52,
    refreshRate: 48,
  },
  Баланс: {
    density: 5200,
    dotSize: 1.35,
    coherence: 76,
    speed: 46,
    refreshRate: 30,
  },
  Предел: {
    density: 6600,
    dotSize: 1.05,
    coherence: 58,
    speed: 34,
    refreshRate: 36,
  },
};

const COPY = {
  en: {
    back: "← Back to CAPTCHA",
    headline: "The figure exists\nonly in time.",
    note:
      "One object is hidden inside the field. In a single frame its dots are statistically indistinguishable from the background—the shape is created only by coherent motion.",
    trial: "TRIAL",
    instruction: "Find the moving shape and click it",
    currentShape: "Current shape",
    signal: "SIGNAL",
    canvas: "Dynamic noise field. Click the moving shape.",
    newTrial: "New trial",
    continue: "Continue",
    freeze: "Freeze frame",
    hideAnswer: "Hide answer",
    showAnswer: "Show answer",
    explanationTitle: "What this tests.",
    explanation:
      "The background is regenerated every frame while some dots inside the mask preserve their relative positions. Pausing removes the temporal link—the central test of the idea.",
    difficulty: "DIFFICULTY",
    density: "Density",
    dotSize: "Dot size",
    coherence: "Signal coherence",
    speed: "Speed",
    frequency: "Frame rate",
    session: "SESSION",
    clicks: "CLICKS",
    accuracy: "ACCURACY",
    median: "MEDIAN",
    empty: "Your first click will appear here.",
    footer:
      "Experimental interface—do not use it as the only layer of protection.",
    search: "Look for the region with coherent motion",
    frozen: "Frame frozen: did the figure disappear?",
    resumed: "Motion resumed",
    hit: "Hit",
    miss: "Miss",
    error: "error",
    fromCenter: "px from center",
  },
  ru: {
    back: "← Вернуться к CAPTCHA",
    headline: "Фигура существует\nтолько во времени.",
    note:
      "Внутри поля спрятан один объект. На отдельном кадре его точки статистически не отличаются от фона — форму создаёт только согласованное движение.",
    trial: "ИСПЫТАНИЕ",
    instruction: "Найдите движущуюся фигуру и нажмите на неё",
    currentShape: "Текущая фигура",
    signal: "СИГНАЛ",
    canvas: "Поле динамического шума. Нажмите на движущуюся фигуру.",
    newTrial: "Новое испытание",
    continue: "Продолжить",
    freeze: "Стоп-кадр",
    hideAnswer: "Скрыть ответ",
    showAnswer: "Показать ответ",
    explanationTitle: "Что здесь проверяется.",
    explanation:
      "Фон пересоздаётся каждый кадр, а часть точек внутри маски сохраняет взаимное положение. Пауза убирает временную связь — это главный тест идеи.",
    difficulty: "СЛОЖНОСТЬ",
    density: "Плотность",
    dotSize: "Размер точки",
    coherence: "Связность сигнала",
    speed: "Скорость",
    frequency: "Частота",
    session: "СЕССИЯ",
    clicks: "КЛИКОВ",
    accuracy: "ТОЧНОСТЬ",
    median: "МЕДИАНА",
    empty: "Первый клик появится здесь.",
    footer:
      "Экспериментальный интерфейс — не использовать как единственный слой защиты.",
    search: "Ищите область с согласованным движением",
    frozen: "Кадр заморожен: исчезла ли фигура?",
    resumed: "Движение продолжено",
    hit: "Попадание",
    miss: "Мимо",
    error: "ошибка",
    fromCenter: "px от центра",
  },
} as const;

function randomPointInShape(shape: ShapeName): Point {
  return { ...randomShapePoint(shape), stable: true };
}

function formatTime(ms: number, locale: "en" | "ru") {
  return `${(ms / 1000).toFixed(1)} ${locale === "ru" ? "с" : "s"}`;
}

export function CaptchaLab() {
  const { locale } = useLanguage();
  const copy = COPY[locale];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const aimCursorRef = useRef<HTMLDivElement>(null);
  const configRef = useRef<LabConfig>(PRESETS.Читаемый);
  const shapeRef = useRef<ShapeName>("Звезда");
  const particlesRef = useRef<Point[]>([]);
  const centerRef = useRef({ x: 180, y: 210 });
  const velocityRef = useRef({ x: 47, y: -22 });
  const radiusRef = useRef(72);
  const pausedRef = useRef(false);
  const revealRef = useRef(false);
  const startedRef = useRef(0);
  const lastFrameRef = useRef(0);
  const lastPaintRef = useRef(0);
  const frameRequestRef = useRef(0);
  const forcePaintRef = useRef(true);
  const flashRef = useRef<
    { x: number; y: number; hit: boolean; until: number } | undefined
  >(undefined);

  const [config, setConfig] = useState<LabConfig>(PRESETS.Читаемый);
  const [difficulty, setDifficulty] = useState<Difficulty>("Читаемый");
  const [shape, setShape] = useState<ShapeName>("Звезда");
  const [paused, setPaused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [trial, setTrial] = useState(1);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [message, setMessage] = useState<LabMessage>({ kind: "search" });

  const rebuildParticles = useCallback((nextShape: ShapeName, coherence: number) => {
    const points = Array.from({ length: 880 }, () => randomPointInShape(nextShape));
    points.forEach((point) => {
      point.stable = Math.random() * 100 < coherence;
    });
    particlesRef.current = points;
  }, []);

  const newTrial = useCallback(() => {
    const nextShape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const angle = Math.random() * Math.PI * 2;
    const speed = configRef.current.speed;
    shapeRef.current = nextShape;
    setShape(nextShape);
    centerRef.current = {
      x: 150 + Math.random() * (WIDTH - 300),
      y: 120 + Math.random() * (HEIGHT - 240),
    };
    velocityRef.current = {
      x: Math.cos(angle) * speed,
      y: Math.sin(angle) * speed,
    };
    radiusRef.current = 64 + Math.random() * 12;
    rebuildParticles(nextShape, configRef.current.coherence);
    startedRef.current = Date.now();
    revealRef.current = false;
    setRevealed(false);
    pausedRef.current = false;
    setPaused(false);
    flashRef.current = undefined;
    setMessage({ kind: "search" });
    setTrial((value) => value + 1);
  }, [rebuildParticles]);

  useEffect(() => {
    configRef.current = config;
    rebuildParticles(shapeRef.current, config.coherence);
  }, [config, rebuildParticles]);

  useEffect(() => {
    startedRef.current = Date.now();
    rebuildParticles(shapeRef.current, configRef.current.coherence);

    const render = (time: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (pausedRef.current && !forcePaintRef.current) {
        frameRequestRef.current = requestAnimationFrame(render);
        return;
      }

      const frameInterval = 1000 / configRef.current.refreshRate;
      if (time - lastPaintRef.current < frameInterval) {
        frameRequestRef.current = requestAnimationFrame(render);
        return;
      }

      const dt = Math.min((time - lastFrameRef.current) / 1000 || 0, 0.05);
      lastFrameRef.current = time;
      lastPaintRef.current = time;

      const center = centerRef.current;
      const velocity = velocityRef.current;
      const radius = radiusRef.current;

      if (!pausedRef.current) {
        center.x += velocity.x * dt;
        center.y += velocity.y * dt;
        if (center.x < radius + 24 || center.x > WIDTH - radius - 24) {
          velocity.x *= -1;
          center.x = Math.max(radius + 24, Math.min(WIDTH - radius - 24, center.x));
        }
        if (center.y < radius + 24 || center.y > HEIGHT - radius - 24) {
          velocity.y *= -1;
          center.y = Math.max(radius + 24, Math.min(HEIGHT - radius - 24, center.y));
        }
      }

      ctx.fillStyle = "#e8e7e1";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      const total = configRef.current.density;
      const boxArea = radius * radius * 4;
      const targetRatio =
        (boxArea * shapeAreaRatio(shapeRef.current)) / (WIDTH * HEIGHT);
      const targetCount = Math.max(80, Math.floor(total * targetRatio));
      const backgroundCount = total - targetCount;
      const dotSize = configRef.current.dotSize;

      ctx.fillStyle = "#10110f";
      ctx.beginPath();
      let placed = 0;
      while (placed < backgroundCount) {
        const x = Math.random() * WIDTH;
        const y = Math.random() * HEIGHT;
        const nx = (x - center.x) / radius;
        const ny = (y - center.y) / radius;
        if (!inShape(shapeRef.current, nx, ny)) {
          ctx.rect(x, y, dotSize, dotSize);
          placed += 1;
        }
      }
      ctx.fill();

      ctx.beginPath();
      for (let i = 0; i < targetCount; i += 1) {
        const point = particlesRef.current[i];
        if (!point) continue;
        if (!pausedRef.current && !point.stable) {
          const fresh = randomPointInShape(shapeRef.current);
          point.x = fresh.x;
          point.y = fresh.y;
        }
        const x = center.x + point.x * radius;
        const y = center.y + point.y * radius;
        ctx.rect(x, y, dotSize, dotSize);
      }
      ctx.fill();

      if (revealRef.current) {
        ctx.save();
        ctx.strokeStyle = "#b6f03a";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius + 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#b6f03a";
        ctx.font = "600 12px ui-monospace, monospace";
        ctx.fillText(`${shapeGlyph(shapeRef.current)} ${shapeRef.current}`, center.x - 30, center.y - radius - 16);
        ctx.restore();
      }

      const flash = flashRef.current;
      if (flash && flash.until > Date.now()) {
        ctx.save();
        ctx.strokeStyle = flash.hit ? "#b6f03a" : "#ff6a4d";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(flash.x, flash.y, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(flash.x - 17, flash.y);
        ctx.lineTo(flash.x + 17, flash.y);
        ctx.moveTo(flash.x, flash.y - 17);
        ctx.lineTo(flash.x, flash.y + 17);
        ctx.stroke();
        ctx.restore();
      }

      forcePaintRef.current = false;
      frameRequestRef.current = requestAnimationFrame(render);
    };

    frameRequestRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameRequestRef.current);
  }, [rebuildParticles]);

  const updateConfig = <K extends keyof LabConfig>(key: K, value: LabConfig[K]) => {
    if (key === "speed") {
      const velocity = velocityRef.current;
      const length = Math.hypot(velocity.x, velocity.y) || 1;
      velocity.x = (velocity.x / length) * Number(value);
      velocity.y = (velocity.y / length) * Number(value);
    }
    forcePaintRef.current = true;
    setConfig((current) => ({ ...current, [key]: value }));
    setDifficulty("Баланс");
  };

  const choosePreset = (preset: Difficulty) => {
    const velocity = velocityRef.current;
    const length = Math.hypot(velocity.x, velocity.y) || 1;
    velocity.x = (velocity.x / length) * PRESETS[preset].speed;
    velocity.y = (velocity.y / length) * PRESETS[preset].speed;
    forcePaintRef.current = true;
    setDifficulty(preset);
    setConfig(PRESETS[preset]);
  };

  const togglePause = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    setMessage({ kind: pausedRef.current ? "frozen" : "resumed" });
  };

  const toggleReveal = () => {
    revealRef.current = !revealRef.current;
    forcePaintRef.current = true;
    setRevealed(revealRef.current);
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
    const center = centerRef.current;
    const error = Math.hypot(x - center.x, y - center.y);
    const hit = inShape(
      shapeRef.current,
      (x - center.x) / radiusRef.current,
      (y - center.y) / radiusRef.current,
    );
    const elapsed = Date.now() - startedRef.current;
    flashRef.current = { x, y, hit, until: Date.now() + 900 };
    forcePaintRef.current = true;
    setMessage({
      kind: "result",
      hit,
      elapsed,
      error: Math.round(error),
    });
    setAttempts((current) =>
      [
        {
          id: Date.now(),
          shape: shapeRef.current,
          hit,
          time: elapsed,
          error: Math.round(error),
        },
        ...current,
      ].slice(0, 12),
    );
  };

  const handlePointerMove = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    const aimCursor = aimCursorRef.current;
    if (!aimCursor) return;
    const rect = event.currentTarget.getBoundingClientRect();
    aimCursor.style.left = `${event.clientX - rect.left}px`;
    aimCursor.style.top = `${event.clientY - rect.top}px`;
    aimCursor.hidden = false;
  };

  const hideAimCursor = () => {
    if (aimCursorRef.current) aimCursorRef.current.hidden = true;
  };

  const stats = useMemo(() => {
    const successful = attempts.filter((attempt) => attempt.hit);
    const sortedTimes = successful.map((attempt) => attempt.time).sort((a, b) => a - b);
    const median = sortedTimes.length
      ? sortedTimes[Math.floor(sortedTimes.length / 2)]
      : 0;
    return {
      accuracy: attempts.length
        ? Math.round((successful.length / attempts.length) * 100)
        : 0,
      median,
    };
  }, [attempts]);

  const messageText =
    message.kind === "search"
      ? copy.search
      : message.kind === "frozen"
        ? copy.frozen
        : message.kind === "resumed"
          ? copy.resumed
          : message.hit
            ? `${copy.hit} · ${formatTime(message.elapsed, locale)} · ${copy.error} ${message.error} px`
            : `${copy.miss} · ${message.error} ${copy.fromCenter}`;

  return (
    <main>
      <header className="topbar">
        <Link className="brand" href="/" aria-label="WHOIZE CAPTCHA">
          WHOIZE<span>/</span>MOTION LAB
        </Link>
        <div className="topbar-actions">
          <Link className="lab-back" href="/">
            {copy.back}
          </Link>
          <LanguageSwitch />
        </div>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">TEMPORAL PERCEPTION CHALLENGE</p>
          <h1>
            {copy.headline.split("\n").map((line, index) => (
              <span key={line}>
                {index > 0 && <br />}
                {line}
              </span>
            ))}
          </h1>
        </div>
        <p className="hero-note">{copy.note}</p>
      </section>

      <section className="workspace">
        <div className="experiment">
          <div className="experiment-head">
            <div>
              <span className="micro-label">
                {copy.trial} {String(trial).padStart(2, "0")}
              </span>
              <h2>{copy.instruction}</h2>
            </div>
            <div
              className="target-chip"
              aria-label={`${copy.currentShape}: ${shapeLabel(shape, locale)}`}
            >
              <span>{shapeGlyph(shape)}</span>
              <div>
                <small>{copy.signal}</small>
                <strong>{shapeLabel(shape, locale)}</strong>
              </div>
            </div>
          </div>

          <div className="canvas-shell">
            <canvas
              ref={canvasRef}
              width={WIDTH}
              height={HEIGHT}
              onClick={handleCanvasClick}
              onPointerEnter={handlePointerMove}
              onPointerMove={handlePointerMove}
              onPointerLeave={hideAimCursor}
              aria-label={copy.canvas}
            />
            <div
              ref={aimCursorRef}
              className="captcha-aim-cursor"
              aria-hidden="true"
              hidden
            >
              <span />
            </div>
            <div className="canvas-index">RDK—{String(trial).padStart(3, "0")}</div>
            <div className="canvas-message" aria-live="polite">
              {messageText}
            </div>
          </div>

          <div className="toolbar">
            <button className="primary-button" onClick={newTrial}>
              {copy.newTrial} <span>↗</span>
            </button>
            <button className="tool-button" onClick={togglePause}>
              <span>{paused ? "▶" : "Ⅱ"}</span>
              {paused ? copy.continue : copy.freeze}
            </button>
            <button
              className={`tool-button ${revealed ? "active" : ""}`}
              onClick={toggleReveal}
            >
              <span>◎</span>
              {revealed ? copy.hideAnswer : copy.showAnswer}
            </button>
          </div>

          <div className="explanation-strip">
            <span className="strip-number">01</span>
            <p>
              <strong>{copy.explanationTitle}</strong> {copy.explanation}
            </p>
          </div>
        </div>

        <aside className="control-panel">
          <div className="panel-section">
            <div className="section-title">
              <span>{copy.difficulty}</span>
              <span>01—03</span>
            </div>
            <div className="segmented">
              {(Object.keys(PRESETS) as Difficulty[]).map((preset) => (
                <button
                  key={preset}
                  className={difficulty === preset ? "selected" : ""}
                  onClick={() => choosePreset(preset)}
                >
                  {presetLabel(preset, locale)}
                </button>
              ))}
            </div>
          </div>

          <div className="panel-section controls">
            <RangeControl
              label={copy.density}
              value={config.density}
              min={2200}
              max={7200}
              step={100}
              output={config.density.toLocaleString(
                locale === "ru" ? "ru-RU" : "en-US",
              )}
              onChange={(value) => updateConfig("density", value)}
            />
            <RangeControl
              label={copy.dotSize}
              value={config.dotSize}
              min={0.8}
              max={2.4}
              step={0.05}
              output={`${config.dotSize.toFixed(2)} px`}
              onChange={(value) => updateConfig("dotSize", value)}
            />
            <RangeControl
              label={copy.coherence}
              value={config.coherence}
              min={35}
              max={100}
              step={1}
              output={`${config.coherence}%`}
              onChange={(value) => updateConfig("coherence", value)}
            />
            <RangeControl
              label={copy.speed}
              value={config.speed}
              min={18}
              max={90}
              step={1}
              output={`${config.speed} px/s`}
              onChange={(value) => updateConfig("speed", value)}
            />
            <RangeControl
              label={copy.frequency}
              value={config.refreshRate}
              min={12}
              max={48}
              step={1}
              output={`${config.refreshRate} fps`}
              onChange={(value) => updateConfig("refreshRate", value)}
            />
          </div>

          <div className="panel-section">
            <div className="section-title">
              <span>{copy.session}</span>
              <span>
                {attempts.length} {copy.clicks}
              </span>
            </div>
            <div className="stat-grid">
              <div>
                <strong>{stats.accuracy}%</strong>
                <span>{copy.accuracy}</span>
              </div>
              <div>
                <strong>
                  {stats.median ? formatTime(stats.median, locale) : "—"}
                </strong>
                <span>{copy.median}</span>
              </div>
            </div>
            <div className="attempt-log">
              {attempts.length === 0 ? (
                <p>{copy.empty}</p>
              ) : (
                attempts.slice(0, 4).map((attempt) => (
                  <div key={attempt.id}>
                    <span className={attempt.hit ? "hit" : "miss"}>
                      {attempt.hit ? "●" : "×"}
                    </span>
                    <span>{shapeLabel(attempt.shape, locale)}</span>
                    <span>{formatTime(attempt.time, locale)}</span>
                    <span>{attempt.error} px</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </section>

      <footer>
        <p>WHOIZE CAPTCHA RESEARCH · MOTION-DEFINED CONTOUR</p>
        <p>{copy.footer}</p>
      </footer>
    </main>
  );
}

function RangeControl({
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
    <label className="range-control">
      <span>
        <span>{label}</span>
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
