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

type Challenge = {
  id: string;
  imageUrl: string;
  shape: "circle" | "triangle" | "diamond" | "star";
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  expiresAt: number;
  maxAttempts: number;
  payloadBytes: number;
};

const GLYPH = {
  circle: "●",
  triangle: "▲",
  diamond: "◆",
  star: "★",
} as const;

export function LegacyApngCaptcha({
  onClose,
  blurPx = 0,
  brandLabel = "APNG",
  locale = "en",
}: {
  onClose?: () => void;
  blurPx?: number;
  brandLabel?: string;
  locale?: "en" | "ru";
}) {
  const cursorRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef(0);
  const challengeRef = useRef<Challenge | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [attempt, setAttempt] = useState(1);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const copy =
    locale === "ru"
      ? {
          status: {
            loading: "Сервер собирает APNG…",
            playing: "Нажмите на движущуюся фигуру",
            verifying: "Сверяем кадр на сервере…",
            passed: "Проверка пройдена",
            failed: "Промах. Попробуйте ещё раз",
            expired: "Время истекло",
            locked: "Попытки закончились",
            error: "APNG не удалось загрузить",
          },
          find: "НАЙДИТЕ ФИГУРУ",
          attempt: "ПОПЫТКА",
          remaining: "ОСТАЛОСЬ",
          close: "Закрыть APNG CAPTCHA",
          server: "Legacy APNG · серверная проверка · трёхсекундный цикл",
          browserBlur: "браузерный blur",
          newChallenge: "Новый APNG →",
          canvas: "Серверная APNG CAPTCHA",
          shape: {
            circle: "Круг",
            triangle: "Треугольник",
            diamond: "Ромб",
            star: "Звезда",
          },
        }
      : {
          status: {
            loading: "Server is assembling APNG…",
            playing: "Click the moving shape",
            verifying: "Checking the frame on the server…",
            passed: "Verification passed",
            failed: "Missed. Try again",
            expired: "Challenge expired",
            locked: "Attempts exhausted",
            error: "Unable to load APNG",
          },
          find: "FIND THE SHAPE",
          attempt: "ATTEMPT",
          remaining: "REMAINING",
          close: "Close APNG CAPTCHA",
          server: "Legacy APNG · server verified · three-second loop",
          browserBlur: "browser blur",
          newChallenge: "New APNG →",
          canvas: "Server-rendered APNG CAPTCHA",
          shape: {
            circle: "Circle",
            triangle: "Triangle",
            diamond: "Diamond",
            star: "Star",
          },
        };

  const loadChallenge = useCallback(async (signal?: AbortSignal) => {
    setAttempt(1);
    setStatus("loading");
    try {
      const response = await fetch("/api/versions/apng/challenge", {
        method: "POST",
        cache: "no-store",
        headers: { accept: "image/png" },
        signal,
      });
      if (!response.ok) throw new Error("APNG challenge failed");
      const image = await response.blob();
      if (signal?.aborted) return;
      const shape = response.headers.get("x-whoize-shape");
      if (
        shape !== "circle" &&
        shape !== "triangle" &&
        shape !== "diamond" &&
        shape !== "star"
      ) {
        throw new Error("Invalid APNG metadata");
      }
      const next: Challenge = {
        id: response.headers.get("x-whoize-challenge") ?? "",
        imageUrl: URL.createObjectURL(image),
        shape,
        width: Number(response.headers.get("x-whoize-width")),
        height: Number(response.headers.get("x-whoize-height")),
        fps: Number(response.headers.get("x-whoize-fps")),
        frameCount: Number(response.headers.get("x-whoize-frame-count")),
        expiresAt: Number(response.headers.get("x-whoize-expires-at")),
        maxAttempts: Number(response.headers.get("x-whoize-max-attempts")),
        payloadBytes: Number(response.headers.get("x-whoize-payload-bytes")),
      };
      if (
        !next.id ||
        !next.width ||
        !next.height ||
        !next.fps ||
        !next.frameCount ||
        !next.expiresAt
      ) {
        URL.revokeObjectURL(next.imageUrl);
        throw new Error("Incomplete APNG metadata");
      }
      setChallenge((current) => {
        if (current) URL.revokeObjectURL(current.imageUrl);
        return next;
      });
      challengeRef.current = next;
      setSecondsLeft(
        Math.max(0, Math.ceil((next.expiresAt - Date.now()) / 1000)),
      );
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
      if (challengeRef.current) {
        URL.revokeObjectURL(challengeRef.current.imageUrl);
      }
    };
  }, [loadChallenge]);

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
    event: React.MouseEvent<HTMLImageElement>,
  ) => {
    if (status !== "playing" || !challenge) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * challenge.width;
    const y = ((event.clientY - rect.top) / rect.height) * challenge.height;
    const elapsed = performance.now() - startedAtRef.current;
    const frameIndex =
      Math.floor((elapsed / 1000) * challenge.fps) %
      challenge.frameCount;
    if (cursorRef.current) cursorRef.current.hidden = true;
    setStatus("verifying");
    try {
      const response = await fetch(
        `/api/versions/apng/challenge/${encodeURIComponent(challenge.id)}/verify`,
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
      };
      if (response.ok && result.success) {
        setStatus("passed");
      } else if (result.reason === "miss") {
        setAttempt(challenge.maxAttempts - (result.attemptsRemaining ?? 0) + 1);
        setStatus("failed");
        window.setTimeout(() => setStatus("playing"), 700);
      } else if (result.reason === "expired") {
        setStatus("expired");
      } else if (result.reason === "locked" || result.reason === "used") {
        setStatus("locked");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  const handlePointerMove = (
    event: React.PointerEvent<HTMLImageElement>,
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
          WHOIZE<span>/</span>{brandLabel}
        </div>
        <div className="captcha-trial">
          {challenge
            ? `${(challenge.payloadBytes / 1_000_000).toFixed(2)} MB`
            : "··· MB"}
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
        {challenge && (
          // This short-lived APNG is generated by the comparison endpoint.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={blurPx > 0 ? "captcha-browser-blur" : undefined}
            src={challenge.imageUrl}
            alt={`${copy.canvas}: ${copy.shape[challenge.shape]}.`}
            draggable={false}
            style={{ filter: blurPx > 0 ? `blur(${blurPx}px)` : "none" }}
            onLoad={() => {
              startedAtRef.current = performance.now();
              setStatus("playing");
            }}
            onClick={handleClick}
            onPointerEnter={handlePointerMove}
            onPointerMove={handlePointerMove}
            onPointerLeave={() => {
              if (cursorRef.current) cursorRef.current.hidden = true;
            }}
          />
        )}
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
          {blurPx > 0 && ` · ${copy.browserBlur} ${blurPx.toFixed(1)} px`}
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
