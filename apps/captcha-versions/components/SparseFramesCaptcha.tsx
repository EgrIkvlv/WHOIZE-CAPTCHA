"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Status =
  | "loading"
  | "playing"
  | "verifying"
  | "passed"
  | "failed"
  | "expired"
  | "locked"
  | "error";

type Shape = "circle" | "triangle" | "diamond" | "star";

type Reveal = {
  centerX: number;
  centerY: number;
  radius: number;
  frameIndex: number;
};

type Feedback = {
  x: number;
  y: number;
  outcome: "verifying" | "hit" | "miss";
  reveal?: Reveal;
};

type Challenge = {
  id: string;
  shape: Shape;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  density: number;
  dotSize: number;
  loopMs: number;
  expiresAt: number;
  maxAttempts: number;
  payloadBytes: number;
  frames: Uint32Array[];
};

const GLYPH = {
  circle: "●",
  triangle: "▲",
  diamond: "◆",
  star: "★",
} as const;

function traceShape(
  context: CanvasRenderingContext2D,
  shape: Shape,
  centerX: number,
  centerY: number,
  radius: number,
) {
  context.beginPath();
  if (shape === "circle") {
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    return;
  }
  if (shape === "triangle") {
    context.moveTo(centerX, centerY - radius * 0.92);
    context.lineTo(centerX + radius, centerY + radius * 0.72);
    context.lineTo(centerX - radius, centerY + radius * 0.72);
    context.closePath();
    return;
  }
  if (shape === "diamond") {
    context.moveTo(centerX, centerY - radius);
    context.lineTo(centerX + radius, centerY);
    context.lineTo(centerX, centerY + radius);
    context.lineTo(centerX - radius, centerY);
    context.closePath();
    return;
  }
  for (let point = 0; point < 10; point += 1) {
    const angle = -Math.PI / 2 + (point * Math.PI) / 5;
    const pointRadius = point % 2 ? radius * 0.5 : radius;
    const x = centerX + Math.cos(angle) * pointRadius;
    const y = centerY + Math.sin(angle) * pointRadius;
    if (point === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

function strokeWithContrast(
  context: CanvasRenderingContext2D,
  color: string,
  drawPath: () => void,
) {
  context.save();
  context.lineJoin = "round";
  context.lineCap = "round";
  drawPath();
  context.strokeStyle = "#121310";
  context.lineWidth = 7;
  context.stroke();
  drawPath();
  context.strokeStyle = color;
  context.lineWidth = 3.5;
  context.stroke();
  context.restore();
}

function drawFeedback(
  context: CanvasRenderingContext2D,
  shape: Shape,
  feedback: Feedback,
) {
  const color =
    feedback.outcome === "miss"
      ? "#ff6a4d"
      : feedback.outcome === "hit"
        ? "#b6f03a"
        : "#f2f1ea";

  if (feedback.outcome === "hit" && feedback.reveal) {
    strokeWithContrast(context, color, () =>
      traceShape(
        context,
        shape,
        feedback.reveal!.centerX,
        feedback.reveal!.centerY,
        feedback.reveal!.radius + 7,
      ),
    );
  }

  strokeWithContrast(context, color, () => {
    context.beginPath();
    context.arc(feedback.x, feedback.y, 11, 0, Math.PI * 2);
    context.moveTo(feedback.x - 17, feedback.y);
    context.lineTo(feedback.x + 17, feedback.y);
    context.moveTo(feedback.x, feedback.y - 17);
    context.lineTo(feedback.x, feedback.y + 17);
  });
}

function decodeSparsePayload(payload: ArrayBuffer) {
  const bytes = new Uint8Array(payload);
  if (
    bytes.length < 16 ||
    String.fromCharCode(...bytes.subarray(0, 4)) !== "WSP1"
  ) {
    throw new Error("Invalid sparse frame stream");
  }
  let offset = 4;
  const version = bytes[offset++];
  const flags = bytes[offset++];
  if (version !== 1 || !(flags & 1)) {
    throw new Error("Unsupported sparse frame stream");
  }
  const readUint16 = () => {
    if (offset + 2 > bytes.length) throw new Error("Truncated sparse header");
    const value = bytes[offset] | (bytes[offset + 1] << 8);
    offset += 2;
    return value;
  };
  const width = readUint16();
  const height = readUint16();
  const fps = bytes[offset++];
  const dotSize = bytes[offset++] / 10;
  const frameCount = readUint16();
  const density = readUint16();
  const frames: Uint32Array[] = [];

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const pointCount = readUint16();
    const frame = new Uint32Array(pointCount);
    let previous = 0;
    for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
      let gap = 0;
      let shift = 0;
      while (true) {
        if (offset >= bytes.length) throw new Error("Truncated sparse frame");
        const byte = bytes[offset++];
        gap |= (byte & 0x7f) << shift;
        if (!(byte & 0x80)) break;
        shift += 7;
        if (shift > 28) throw new Error("Invalid sparse frame varint");
      }
      previous += gap;
      if (previous >= width * height) {
        throw new Error("Sparse frame cell is out of bounds");
      }
      frame[pointIndex] = previous;
    }
    frames.push(frame);
  }
  if (offset !== bytes.length) throw new Error("Unexpected sparse frame data");
  return { width, height, fps, dotSize, frameCount, density, frames };
}

export function SparseFramesCaptcha({
  onClose,
  locale = "en",
}: {
  onClose?: () => void;
  locale?: "en" | "ru";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef(0);
  const currentFrameRef = useRef(0);
  const frozenFrameRef = useRef<number | null>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [attempt, setAttempt] = useState(1);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const copy =
    locale === "ru"
      ? {
          status: {
            loading: "Сервер собирает sparse-кадры…",
            playing: "Нажмите на движущуюся фигуру",
            verifying: "Сверяем кадр на сервере…",
            passed: "Проверка пройдена",
            failed: "Промах. Попробуйте ещё раз",
            expired: "Время истекло",
            locked: "Попытки закончились",
            error: "Sparse-поток не удалось загрузить",
          },
          find: "НАЙДИТЕ ФИГУРУ",
          attempt: "ПОПЫТКА",
          remaining: "ОСТАЛОСЬ",
          close: "Закрыть Sparse Frames CAPTCHA",
          server:
            "Sparse final-raster · новый фон каждый кадр · бесшовный цикл 4 с",
          newChallenge: "Новый sparse challenge →",
          canvas: "Sparse CAPTCHA с динамическим шумом",
          shape: {
            circle: "Круг",
            triangle: "Треугольник",
            diamond: "Ромб",
            star: "Звезда",
          },
        }
      : {
          status: {
            loading: "Server is assembling sparse frames…",
            playing: "Click the moving shape",
            verifying: "Checking the frame on the server…",
            passed: "Verification passed",
            failed: "Missed. Try again",
            expired: "Challenge expired",
            locked: "Attempts exhausted",
            error: "Unable to load sparse stream",
          },
          find: "FIND THE SHAPE",
          attempt: "ATTEMPT",
          remaining: "REMAINING",
          close: "Close Sparse Frames CAPTCHA",
          server:
            "Sparse final-raster · fresh background every frame · seamless 4 s loop",
          newChallenge: "New sparse challenge →",
          canvas: "Dynamic-noise sparse CAPTCHA",
          shape: {
            circle: "Circle",
            triangle: "Triangle",
            diamond: "Diamond",
            star: "Star",
          },
        };

  const loadChallenge = useCallback(async (signal?: AbortSignal) => {
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
    frozenFrameRef.current = null;
    setFeedback(null);
    setAttempt(1);
    setStatus("loading");
    try {
      const response = await fetch("/api/versions/sparse/challenge", {
        method: "POST",
        cache: "no-store",
        headers: { accept: "application/vnd.whoize.sparse-frames" },
        signal,
      });
      if (!response.ok) throw new Error("Sparse challenge failed");
      const payload = await response.arrayBuffer();
      if (signal?.aborted) return;
      const decoded = decodeSparsePayload(payload);
      const shape = response.headers.get("x-whoize-shape");
      if (
        shape !== "circle" &&
        shape !== "triangle" &&
        shape !== "diamond" &&
        shape !== "star"
      ) {
        throw new Error("Invalid sparse metadata");
      }
      const next: Challenge = {
        id: response.headers.get("x-whoize-challenge") ?? "",
        shape,
        width: Number(response.headers.get("x-whoize-width")),
        height: Number(response.headers.get("x-whoize-height")),
        fps: Number(response.headers.get("x-whoize-fps")),
        frameCount: Number(response.headers.get("x-whoize-frame-count")),
        density: Number(response.headers.get("x-whoize-density")),
        dotSize: Number(response.headers.get("x-whoize-dot-size")),
        loopMs: Number(response.headers.get("x-whoize-loop-ms")),
        expiresAt: Number(response.headers.get("x-whoize-expires-at")),
        maxAttempts: Number(response.headers.get("x-whoize-max-attempts")),
        payloadBytes: payload.byteLength,
        frames: decoded.frames,
      };
      if (
        !next.id ||
        next.width !== decoded.width ||
        next.height !== decoded.height ||
        next.fps !== decoded.fps ||
        next.frameCount !== decoded.frameCount ||
        next.density !== decoded.density ||
        next.dotSize !== decoded.dotSize ||
        next.loopMs !== (next.frameCount / next.fps) * 1000 ||
        next.frames.some((frame) => frame.length !== next.density)
      ) {
        throw new Error("Sparse metadata does not match the payload");
      }
      startedAtRef.current = performance.now();
      currentFrameRef.current = 0;
      setChallenge(next);
      setSecondsLeft(
        Math.max(0, Math.ceil((next.expiresAt - Date.now()) / 1000)),
      );
      setStatus("playing");
    } catch {
      if (!signal?.aborted) setStatus("error");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => void loadChallenge(controller.signal),
      0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (resumeTimerRef.current !== null) {
        window.clearTimeout(resumeTimerRef.current);
      }
    };
  }, [loadChallenge]);

  useEffect(() => {
    if (!challenge) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let animationFrame = 0;
    let lastDrawnFrame = -1;

    const draw = (time: number) => {
      const elapsed = time - startedAtRef.current;
      const frameIndex =
        frozenFrameRef.current ??
        (Math.floor((elapsed / 1000) * challenge.fps) %
          challenge.frameCount);
      currentFrameRef.current = frameIndex;
      if (frameIndex !== lastDrawnFrame) {
        context.fillStyle = "#e8e7e1";
        context.fillRect(0, 0, challenge.width, challenge.height);
        context.fillStyle = "#10110f";
        context.beginPath();
        for (const cell of challenge.frames[frameIndex]) {
          const x = cell % challenge.width;
          const y = Math.floor(cell / challenge.width);
          context.rect(x, y, challenge.dotSize, challenge.dotSize);
        }
        context.fill();
        if (feedback) {
          drawFeedback(context, challenge.shape, feedback);
        }
        lastDrawnFrame = frameIndex;
      }
      animationFrame = window.requestAnimationFrame(draw);
    };
    animationFrame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [challenge, feedback]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (status !== "playing" || !challenge) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((challenge.expiresAt - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
      if (!remaining) setStatus("expired");
    }, 250);
    return () => window.clearInterval(timer);
  }, [challenge, status]);

  const handleClick = async (
    event: React.MouseEvent<HTMLCanvasElement>,
  ) => {
    if (status !== "playing" || !challenge) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * challenge.width;
    const y = ((event.clientY - rect.top) / rect.height) * challenge.height;
    const frameIndex = currentFrameRef.current;
    frozenFrameRef.current = frameIndex;
    setFeedback({ x, y, outcome: "verifying" });
    if (cursorRef.current) cursorRef.current.hidden = true;
    setStatus("verifying");
    try {
      const response = await fetch(
        `/api/versions/sparse/challenge/${encodeURIComponent(challenge.id)}/verify`,
        {
          method: "POST",
          cache: "no-store",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify({ x, y, frameIndex }),
        },
      );
      const result = (await response.json()) as {
        success?: boolean;
        reason?: string;
        attemptsRemaining?: number;
        reveal?: Reveal;
      };
      if (
        response.ok &&
        result.success &&
        result.reveal &&
        Number.isFinite(result.reveal.centerX) &&
        Number.isFinite(result.reveal.centerY) &&
        Number.isFinite(result.reveal.radius) &&
        result.reveal.frameIndex === frameIndex
      ) {
        setFeedback({ x, y, outcome: "hit", reveal: result.reveal });
        setStatus("passed");
      } else if (result.reason === "miss") {
        setAttempt(challenge.maxAttempts - (result.attemptsRemaining ?? 0) + 1);
        setFeedback({ x, y, outcome: "miss" });
        setStatus("failed");
        resumeTimerRef.current = window.setTimeout(() => {
          frozenFrameRef.current = null;
          setFeedback(null);
          setStatus("playing");
          resumeTimerRef.current = null;
        }, 700);
      } else if (result.reason === "expired") {
        setStatus("expired");
      } else if (result.reason === "locked" || result.reason === "used") {
        if (result.reason === "locked") {
          setFeedback({ x, y, outcome: "miss" });
        }
        setStatus("locked");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  const handlePointerMove = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    const cursor = cursorRef.current;
    if (!cursor || status !== "playing") {
      if (cursor) cursor.hidden = true;
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    cursor.style.left = `${event.clientX - rect.left}px`;
    cursor.style.top = `${event.clientY - rect.top}px`;
    cursor.hidden = false;
  };

  return (
    <section className="whoize-captcha">
      <div className="captcha-topline">
        <div className="captcha-logo">
          WHOIZE<span>/</span>SPARSE
        </div>
        <div className="captcha-trial">
          {challenge
            ? `${(challenge.payloadBytes / 1_000_000).toFixed(2)} MB · 04S`
            : "··· MB · 04S"}
        </div>
        <button
          className="captcha-close"
          type="button"
          onClick={onClose}
          aria-label={copy.close}
        >
          ×
        </button>
      </div>

      <div className="captcha-instruction">
        <div className="captcha-target">
          <span>{challenge ? GLYPH[challenge.shape] : "·"}</span>
          <div>
            <small>{copy.find}</small>
            <strong>
              {challenge ? copy.shape[challenge.shape] : "···"}
            </strong>
          </div>
        </div>
        <div className="captcha-counter">
          <div>
            <small>{copy.attempt}</small>
            <strong>
              {String(attempt).padStart(2, "0")}/
              {String(challenge?.maxAttempts ?? 0).padStart(2, "0")}
            </strong>
          </div>
          <div className={secondsLeft <= 10 ? "ending" : ""}>
            <small>{copy.remaining}</small>
            <strong>00:{String(secondsLeft).padStart(2, "0")}</strong>
          </div>
        </div>
      </div>

      <div className={`captcha-canvas-wrap status-${status}`}>
        <canvas
          ref={canvasRef}
          width={challenge?.width ?? 640}
          height={challenge?.height ?? 360}
          aria-label={
            challenge
              ? `${copy.canvas}: ${copy.shape[challenge.shape]}.`
              : copy.canvas
          }
          onClick={handleClick}
          onPointerEnter={handlePointerMove}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => {
            if (cursorRef.current) cursorRef.current.hidden = true;
          }}
        />
        <div
          ref={cursorRef}
          className="captcha-aim-cursor"
          aria-hidden="true"
          hidden
        >
          <span />
        </div>
        <div className={`captcha-result result-${status}`} aria-live="polite">
          <span className="result-symbol">
            {status === "passed"
              ? "✓"
              : status === "failed" ||
                  status === "expired" ||
                  status === "locked" ||
                  status === "error"
                ? "×"
                : status === "loading" || status === "verifying"
                  ? "···"
                  : "●"}
          </span>
          {copy.status[status]}
        </div>
      </div>

      <div className="captcha-bottom">
        <div>
          <span className="privacy-dot" />
          {copy.server}
        </div>
        {(status === "expired" ||
          status === "locked" ||
          status === "error") && (
          <button type="button" onClick={() => void loadChallenge()}>
            {copy.newChallenge}
          </button>
        )}
      </div>
    </section>
  );
}
