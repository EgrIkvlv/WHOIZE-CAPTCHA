"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ShapeName = "Круг" | "Треугольник" | "Ромб" | "Звезда";
type ChallengeStatus =
  | "playing"
  | "verifying"
  | "passed"
  | "failed"
  | "expired"
  | "locked";
type Point = { x: number; y: number };

const WIDTH = 640;
const HEIGHT = 360;
const DENSITY = 7200;
const DOT_SIZE = 2.4;
const FPS = 48;
const SPEED = 52;
const MAX_ATTEMPTS = 3;
const SHAPES: ShapeName[] = ["Круг", "Треугольник", "Ромб", "Звезда"];

function inShape(shape: ShapeName, x: number, y: number) {
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
  return { x, y };
}

function glyph(shape: ShapeName) {
  if (shape === "Круг") return "●";
  if (shape === "Треугольник") return "▲";
  if (shape === "Ромб") return "◆";
  return "★";
}

export function MotionCaptcha({
  onPass,
  onClose,
}: {
  onPass: (token: string) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shapeRef = useRef<ShapeName>("Звезда");
  const particlesRef = useRef<Point[]>([]);
  const centerRef = useRef({ x: 180, y: 180 });
  const velocityRef = useRef({ x: SPEED, y: 0 });
  const radiusRef = useRef(68);
  const statusRef = useRef<ChallengeStatus>("playing");
  const lastFrameRef = useRef(0);
  const lastPaintRef = useRef(0);
  const animationRef = useRef(0);
  const timeoutRefs = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const markerRef = useRef<{ x: number; y: number; hit: boolean } | null>(null);

  const [status, setStatus] = useState<ChallengeStatus>("playing");
  const [shape, setShape] = useState<ShapeName>("Звезда");
  const [attempt, setAttempt] = useState(1);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [challengeNumber, setChallengeNumber] = useState(1);

  const updateStatus = useCallback((next: ChallengeStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const createChallenge = useCallback(
    (increment = true) => {
      const nextShape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
      const angle = Math.random() * Math.PI * 2;
      shapeRef.current = nextShape;
      setShape(nextShape);
      centerRef.current = {
        x: 130 + Math.random() * (WIDTH - 260),
        y: 105 + Math.random() * (HEIGHT - 210),
      };
      velocityRef.current = {
        x: Math.cos(angle) * SPEED,
        y: Math.sin(angle) * SPEED,
      };
      radiusRef.current = 62 + Math.random() * 10;
      particlesRef.current = Array.from({ length: 980 }, () =>
        randomPointInShape(nextShape),
      );
      markerRef.current = null;
      setSecondsLeft(60);
      updateStatus("playing");
      if (increment) setChallengeNumber((value) => value + 1);
    },
    [updateStatus],
  );

  useEffect(() => {
    const initialFrame = requestAnimationFrame(() => createChallenge(false));
    return () => cancelAnimationFrame(initialFrame);
  }, [createChallenge]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    if (status !== "playing") return;
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          updateStatus("expired");
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status, updateStatus]);

  useEffect(() => {
    const render = (time: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      const frameInterval = 1000 / FPS;
      if (time - lastPaintRef.current < frameInterval) {
        animationRef.current = requestAnimationFrame(render);
        return;
      }

      const dt = Math.min((time - lastFrameRef.current) / 1000 || 0, 0.05);
      lastFrameRef.current = time;
      lastPaintRef.current = time;

      const center = centerRef.current;
      const velocity = velocityRef.current;
      const radius = radiusRef.current;
      if (statusRef.current === "playing") {
        center.x += velocity.x * dt;
        center.y += velocity.y * dt;
        if (center.x < radius + 18 || center.x > WIDTH - radius - 18) {
          velocity.x *= -1;
          center.x = Math.max(
            radius + 18,
            Math.min(WIDTH - radius - 18, center.x),
          );
        }
        if (center.y < radius + 18 || center.y > HEIGHT - radius - 18) {
          velocity.y *= -1;
          center.y = Math.max(
            radius + 18,
            Math.min(HEIGHT - radius - 18, center.y),
          );
        }
      }

      ctx.fillStyle = "#e8e7e1";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      const targetRatio =
        (radius * radius * 4 * shapeAreaRatio(shapeRef.current)) /
        (WIDTH * HEIGHT);
      const targetCount = Math.max(120, Math.floor(DENSITY * targetRatio));
      const backgroundCount = DENSITY - targetCount;

      ctx.fillStyle = "#10110f";
      ctx.beginPath();
      let placed = 0;
      while (placed < backgroundCount) {
        const x = Math.random() * WIDTH;
        const y = Math.random() * HEIGHT;
        if (
          !inShape(
            shapeRef.current,
            (x - center.x) / radius,
            (y - center.y) / radius,
          )
        ) {
          ctx.rect(x, y, DOT_SIZE, DOT_SIZE);
          placed += 1;
        }
      }
      ctx.fill();

      ctx.beginPath();
      for (let index = 0; index < targetCount; index += 1) {
        const point = particlesRef.current[index];
        if (!point) continue;
        ctx.rect(
          center.x + point.x * radius,
          center.y + point.y * radius,
          DOT_SIZE,
          DOT_SIZE,
        );
      }
      ctx.fill();

      if (statusRef.current === "passed") {
        ctx.save();
        ctx.strokeStyle = "#b6f03a";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius + 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      const marker = markerRef.current;
      if (marker) {
        ctx.save();
        ctx.strokeStyle = marker.hit ? "#b6f03a" : "#ff6a4d";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(marker.x, marker.y, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(marker.x - 17, marker.y);
        ctx.lineTo(marker.x + 17, marker.y);
        ctx.moveTo(marker.x, marker.y - 17);
        ctx.lineTo(marker.x, marker.y + 17);
        ctx.stroke();
        ctx.restore();
      }

      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationRef.current);
  }, []);

  useEffect(() => {
    const timers = timeoutRefs.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (statusRef.current !== "playing") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
    const center = centerRef.current;
    const hit = inShape(
      shapeRef.current,
      (x - center.x) / radiusRef.current,
      (y - center.y) / radiusRef.current,
    );
    markerRef.current = { x, y, hit };
    updateStatus("verifying");

    const verifyTimer = setTimeout(() => {
      if (hit) {
        updateStatus("passed");
        const token = `whoize_${challengeNumber}_${Date.now().toString(36)}`;
        onPass(token);
        return;
      }

      updateStatus("failed");
      const nextTimer = setTimeout(() => {
        if (attempt >= MAX_ATTEMPTS) {
          updateStatus("locked");
        } else {
          setAttempt((value) => value + 1);
          createChallenge();
        }
      }, 900);
      timeoutRefs.current.push(nextTimer);
    }, 380);
    timeoutRefs.current.push(verifyTimer);
  };

  const resetAfterStop = () => {
    setAttempt(1);
    createChallenge();
  };

  const statusText = {
    playing: "Нажмите один раз на движущуюся фигуру",
    verifying: "Проверяем координату…",
    passed: "Проверка пройдена",
    failed: "Не попали. Создаём новое испытание…",
    expired: "Время испытания истекло",
    locked: "Три попытки исчерпаны",
  }[status];

  return (
    <>
      <div className="captcha-topline">
        <div className="captcha-logo">
          WHOIZE<span>/</span>VERIFY
        </div>
        <div className="captcha-trial">
          CH—{String(challengeNumber).padStart(3, "0")}
        </div>
        <button
          className="captcha-close"
          type="button"
          onClick={onClose}
          aria-label="Закрыть CAPTCHA"
        >
          ×
        </button>
      </div>

      <div className="captcha-instruction">
        <div className="captcha-target">
          <span>{glyph(shape)}</span>
          <div>
            <small>НАЙДИТЕ ФИГУРУ</small>
            <strong>{shape}</strong>
          </div>
        </div>
        <div className="captcha-counter">
          <div>
            <small>ПОПЫТКА</small>
            <strong>
              {String(attempt).padStart(2, "0")}/{String(MAX_ATTEMPTS).padStart(2, "0")}
            </strong>
          </div>
          <div className={secondsLeft <= 10 ? "ending" : ""}>
            <small>ОСТАЛОСЬ</small>
            <strong>00:{String(secondsLeft).padStart(2, "0")}</strong>
          </div>
        </div>
      </div>

      <div className={`captcha-canvas-wrap status-${status}`}>
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          onClick={handleClick}
          aria-label={`Поле динамического шума. Найдите фигуру: ${shape}.`}
        />
        <div className="captcha-reticle">＋</div>
        <div className={`captcha-result result-${status}`} aria-live="polite">
          <span className="result-symbol">
            {status === "passed"
              ? "✓"
              : status === "failed" ||
                  status === "expired" ||
                  status === "locked"
                ? "×"
                : status === "verifying"
                  ? "···"
                  : "●"}
          </span>
          {statusText}
        </div>
      </div>

      <div className="captcha-bottom">
        <div>
          <span className="privacy-dot" />
          Локальная проверка · данные не отправляются
        </div>
        {(status === "expired" || status === "locked") && (
          <button type="button" onClick={resetAfterStop}>
            Новое испытание →
          </button>
        )}
      </div>
    </>
  );
}
