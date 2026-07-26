"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ChallengeStatus =
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
};

export type ServerMotionCaptchaProps = {
  onPass: (token: string, expiresAt: number) => void;
  onClose?: () => void;
  locale?: "en" | "ru";
};

const GLYPH = {
  circle: "●",
  triangle: "▲",
  diamond: "◆",
  star: "★",
} as const;

export function ServerMotionCaptcha({
  onPass,
  onClose,
  locale = "en",
}: ServerMotionCaptchaProps) {
  const aimCursorRef = useRef<HTMLDivElement>(null);
  const animationStartedAtRef = useRef(0);
  const challengeRef = useRef<Challenge | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [status, setStatus] = useState<ChallengeStatus>("loading");
  const [attempt, setAttempt] = useState(1);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const copy =
    locale === "ru"
      ? {
          status: {
            loading: "Сервер создаёт испытание…",
            playing: "Нажмите один раз на движущуюся фигуру",
            verifying: "Сервер проверяет координату…",
            passed: "Проверка пройдена",
            failed: "Не попали. Попробуйте ещё раз",
            expired: "Время испытания истекло",
            locked: "Попытки исчерпаны",
            error: "Не удалось загрузить испытание",
          },
          close: "Закрыть CAPTCHA",
          find: "НАЙДИТЕ ФИГУРУ",
          attempt: "ПОПЫТКА",
          remaining: "ОСТАЛОСЬ",
          canvas: "Серверное поле динамического шума. Найдите фигуру",
          server: "Серверная проверка · ответ не передаётся в браузер",
          newChallenge: "Новое испытание →",
          shape: {
            circle: "Круг",
            triangle: "Треугольник",
            diamond: "Ромб",
            star: "Звезда",
          },
        }
      : {
          status: {
            loading: "Server is creating a challenge…",
            playing: "Click once on the moving shape",
            verifying: "Server is checking the coordinate…",
            passed: "Verification passed",
            failed: "Missed. Try again",
            expired: "Challenge expired",
            locked: "Attempts exhausted",
            error: "Unable to load the challenge",
          },
          close: "Close CAPTCHA",
          find: "FIND THE SHAPE",
          attempt: "ATTEMPT",
          remaining: "REMAINING",
          canvas: "Server-rendered dynamic noise field. Find the shape",
          server: "Server verification · the answer stays off-device",
          newChallenge: "New challenge →",
          shape: {
            circle: "Circle",
            triangle: "Triangle",
            diamond: "Diamond",
            star: "Star",
          },
        };

  const loadChallenge = useCallback(async (signal?: AbortSignal) => {
    setAttempt(1);
    try {
      const response = await fetch("/api/challenge", {
        method: "POST",
        cache: "no-store",
        headers: { accept: "image/png" },
        signal,
      });
      if (!response.ok) throw new Error("Challenge request failed");
      const image = await response.blob();
      if (signal?.aborted) return;
      const shape = response.headers.get("x-whoize-shape");
      if (
        shape !== "circle" &&
        shape !== "triangle" &&
        shape !== "diamond" &&
        shape !== "star"
      ) {
        throw new Error("Challenge metadata is invalid");
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
      };
      if (
        !next.id ||
        !next.width ||
        !next.height ||
        !next.fps ||
        !next.frameCount ||
        !next.expiresAt ||
        !next.maxAttempts
      ) {
        URL.revokeObjectURL(next.imageUrl);
        throw new Error("Challenge metadata is incomplete");
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
      if (signal?.aborted) return;
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const startTimer = window.setTimeout(
      () => void loadChallenge(controller.signal),
      0,
    );
    return () => {
      window.clearTimeout(startTimer);
      controller.abort();
      const current = challengeRef.current;
      if (current) URL.revokeObjectURL(current.imageUrl);
    };
  }, [loadChallenge]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
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

  const handleImageLoad = () => {
    animationStartedAtRef.current = performance.now();
    setStatus("playing");
  };

  const handleClick = async (
    event: React.MouseEvent<HTMLImageElement>,
  ) => {
    if (status !== "playing" || !challenge) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * challenge.width;
    const y = ((event.clientY - rect.top) / rect.height) * challenge.height;
    const elapsed = performance.now() - animationStartedAtRef.current;
    const frameIndex =
      Math.floor((elapsed / 1000) * challenge.fps) %
      challenge.frameCount;
    if (aimCursorRef.current) aimCursorRef.current.hidden = true;
    setStatus("verifying");

    try {
      const response = await fetch(
        `/api/challenge/${encodeURIComponent(challenge.id)}/verify`,
        {
          method: "POST",
          cache: "no-store",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify({ x, y, frameIndex, elapsedMs: elapsed }),
        },
      );
      const result = (await response.json()) as {
        success?: boolean;
        proofToken?: string;
        proofExpiresAt?: number;
        attemptsRemaining?: number;
        reason?: string;
      };
      if (
        response.ok &&
        result.success &&
        result.proofToken &&
        result.proofExpiresAt
      ) {
        setStatus("passed");
        onPass(result.proofToken, result.proofExpiresAt);
        return;
      }
      if (result.reason === "miss") {
        setAttempt(challenge.maxAttempts - (result.attemptsRemaining ?? 0) + 1);
        setStatus("failed");
        window.setTimeout(() => setStatus("playing"), 700);
      } else if (result.reason === "locked" || result.reason === "used") {
        setStatus("locked");
      } else if (result.reason === "expired") {
        setStatus("expired");
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
    const aimCursor = aimCursorRef.current;
    if (!aimCursor || status !== "playing") {
      if (aimCursor) aimCursor.hidden = true;
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    aimCursor.style.left = `${event.clientX - rect.left}px`;
    aimCursor.style.top = `${event.clientY - rect.top}px`;
    aimCursor.hidden = false;
  };

  return (
    <section className="whoize-captcha">
      <div className="captcha-topline">
        <div className="captcha-logo">
          WHOIZE<span>/</span>VERIFY
        </div>
        <div className="captcha-trial">
          {challenge ? `CH—${challenge.id.slice(-5).toUpperCase()}` : "CH—···"}
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
          // The API returns a short-lived blob URL, so Next image optimization
          // cannot be used for this server-generated animation.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={challenge.imageUrl}
            alt={`${copy.canvas}: ${copy.shape[challenge.shape]}.`}
            draggable={false}
            onLoad={handleImageLoad}
            onClick={handleClick}
            onPointerEnter={handlePointerMove}
            onPointerMove={handlePointerMove}
            onPointerLeave={() => {
              if (aimCursorRef.current) aimCursorRef.current.hidden = true;
            }}
          />
        )}
        <div
          ref={aimCursorRef}
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
                : status === "verifying" || status === "loading"
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
          <button
            type="button"
            onClick={() => {
              setStatus("loading");
              void loadChallenge();
            }}
          >
            {copy.newChallenge}
          </button>
        )}
      </div>
    </section>
  );
}
