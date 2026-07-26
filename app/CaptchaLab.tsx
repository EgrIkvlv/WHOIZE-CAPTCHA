"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ShapeName = "Круг" | "Треугольник" | "Ромб" | "Звезда";
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

function inShape(shape: ShapeName, x: number, y: number) {
  if (shape === "Круг") return x * x + y * y <= 1;
  if (shape === "Ромб") return Math.abs(x) + Math.abs(y) <= 1;
  if (shape === "Треугольник") {
    return y >= -0.92 && y <= 0.72 && Math.abs(x) <= (y + 0.92) / 1.64;
  }

  const angle = Math.atan2(y, x);
  const radius = Math.sqrt(x * x + y * y);
  const segment = ((angle + Math.PI * 2 + Math.PI / 2) / (Math.PI / 5)) % 2;
  const edge = segment < 1 ? 1 - segment * 0.5 : 0.5 + (segment - 1) * 0.5;
  return radius <= edge;
}

function shapeAreaRatio(shape: ShapeName) {
  if (shape === "Круг") return Math.PI / 4;
  if (shape === "Ромб" || shape === "Треугольник") return 0.5;
  return 0.42;
}

function randomPointInShape(shape: ShapeName): Point {
  let x = 0;
  let y = 0;
  do {
    x = Math.random() * 2 - 1;
    y = Math.random() * 2 - 1;
  } while (!inShape(shape, x, y));
  return { x, y, stable: true };
}

function shapeGlyph(shape: ShapeName) {
  if (shape === "Круг") return "●";
  if (shape === "Треугольник") return "▲";
  if (shape === "Ромб") return "◆";
  return "★";
}

function formatTime(ms: number) {
  return `${(ms / 1000).toFixed(1)} с`;
}

export function CaptchaLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const configRef = useRef<LabConfig>(PRESETS.Баланс);
  const shapeRef = useRef<ShapeName>("Звезда");
  const particlesRef = useRef<Point[]>([]);
  const centerRef = useRef({ x: 180, y: 210 });
  const velocityRef = useRef({ x: 42, y: -20 });
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

  const [config, setConfig] = useState<LabConfig>(PRESETS.Баланс);
  const [difficulty, setDifficulty] = useState<Difficulty>("Баланс");
  const [shape, setShape] = useState<ShapeName>("Звезда");
  const [paused, setPaused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [trial, setTrial] = useState(1);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [message, setMessage] = useState("Ищите область с согласованным движением");

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
    setMessage("Ищите область с согласованным движением");
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
    setMessage(
      pausedRef.current
        ? "Кадр заморожен: исчезла ли фигура?"
        : "Движение продолжено",
    );
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
    setMessage(
      hit
        ? `Попадание · ${formatTime(elapsed)} · ошибка ${Math.round(error)} px`
        : `Мимо · ${Math.round(error)} px от центра`,
    );
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

  return (
    <main>
      <header className="topbar">
        <Link className="brand" href="/" aria-label="WHOIZE CAPTCHA">
          WHOIZE<span>/</span>MOTION LAB
        </Link>
        <Link className="lab-back" href="/">
          ← Вернуться к CAPTCHA
        </Link>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">TEMPORAL PERCEPTION CHALLENGE</p>
          <h1>Фигура существует<br />только во времени.</h1>
        </div>
        <p className="hero-note">
          Внутри поля спрятан один объект. На отдельном кадре его точки
          статистически не отличаются от фона — форму создаёт только
          согласованное движение.
        </p>
      </section>

      <section className="workspace">
        <div className="experiment">
          <div className="experiment-head">
            <div>
              <span className="micro-label">ИСПЫТАНИЕ {String(trial).padStart(2, "0")}</span>
              <h2>Найдите движущуюся фигуру и нажмите на неё</h2>
            </div>
            <div className="target-chip" aria-label={`Текущая фигура: ${shape}`}>
              <span>{shapeGlyph(shape)}</span>
              <div>
                <small>СИГНАЛ</small>
                <strong>{shape}</strong>
              </div>
            </div>
          </div>

          <div className="canvas-shell">
            <canvas
              ref={canvasRef}
              width={WIDTH}
              height={HEIGHT}
              onClick={handleCanvasClick}
              aria-label="Поле динамического шума. Нажмите на движущуюся фигуру."
            />
            <div className="canvas-index">RDK—{String(trial).padStart(3, "0")}</div>
            <div className="canvas-message" aria-live="polite">{message}</div>
          </div>

          <div className="toolbar">
            <button className="primary-button" onClick={newTrial}>
              Новое испытание <span>↗</span>
            </button>
            <button className="tool-button" onClick={togglePause}>
              <span>{paused ? "▶" : "Ⅱ"}</span>
              {paused ? "Продолжить" : "Стоп-кадр"}
            </button>
            <button
              className={`tool-button ${revealed ? "active" : ""}`}
              onClick={toggleReveal}
            >
              <span>◎</span>
              {revealed ? "Скрыть ответ" : "Показать ответ"}
            </button>
          </div>

          <div className="explanation-strip">
            <span className="strip-number">01</span>
            <p>
              <strong>Что здесь проверяется.</strong> Фон пересоздаётся каждый
              кадр, а часть точек внутри маски сохраняет взаимное положение.
              Пауза убирает временную связь — это главный тест идеи.
            </p>
          </div>
        </div>

        <aside className="control-panel">
          <div className="panel-section">
            <div className="section-title">
              <span>СЛОЖНОСТЬ</span>
              <span>01—03</span>
            </div>
            <div className="segmented">
              {(Object.keys(PRESETS) as Difficulty[]).map((preset) => (
                <button
                  key={preset}
                  className={difficulty === preset ? "selected" : ""}
                  onClick={() => choosePreset(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="panel-section controls">
            <RangeControl
              label="Плотность"
              value={config.density}
              min={2200}
              max={7200}
              step={100}
              output={config.density.toLocaleString("ru-RU")}
              onChange={(value) => updateConfig("density", value)}
            />
            <RangeControl
              label="Размер точки"
              value={config.dotSize}
              min={0.8}
              max={2.4}
              step={0.05}
              output={`${config.dotSize.toFixed(2)} px`}
              onChange={(value) => updateConfig("dotSize", value)}
            />
            <RangeControl
              label="Связность сигнала"
              value={config.coherence}
              min={35}
              max={100}
              step={1}
              output={`${config.coherence}%`}
              onChange={(value) => updateConfig("coherence", value)}
            />
            <RangeControl
              label="Скорость"
              value={config.speed}
              min={18}
              max={90}
              step={1}
              output={`${config.speed} px/s`}
              onChange={(value) => updateConfig("speed", value)}
            />
            <RangeControl
              label="Частота"
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
              <span>СЕССИЯ</span>
              <span>{attempts.length} КЛИКОВ</span>
            </div>
            <div className="stat-grid">
              <div>
                <strong>{stats.accuracy}%</strong>
                <span>ТОЧНОСТЬ</span>
              </div>
              <div>
                <strong>{stats.median ? formatTime(stats.median) : "—"}</strong>
                <span>МЕДИАНА</span>
              </div>
            </div>
            <div className="attempt-log">
              {attempts.length === 0 ? (
                <p>Первый клик появится здесь.</p>
              ) : (
                attempts.slice(0, 4).map((attempt) => (
                  <div key={attempt.id}>
                    <span className={attempt.hit ? "hit" : "miss"}>
                      {attempt.hit ? "●" : "×"}
                    </span>
                    <span>{attempt.shape}</span>
                    <span>{formatTime(attempt.time)}</span>
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
        <p>Экспериментальный интерфейс — не использовать как единственный слой защиты.</p>
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
