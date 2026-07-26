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
  shape: "circle" | "triangle" | "diamond" | "star";
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  segmentDurationMs: number;
  segmentCount: number;
  expiresAt: number;
  maxAttempts: number;
  transport?: "webm-only";
  codec?: "vp8";
  variant?:
    | "matched-motion-decoys"
    | "human-tuned-decoys"
    | "regenerative-motion"
    | "regenerative-readable";
};

export type ServerMotionCaptchaProps = {
  onPass: (token: string, expiresAt: number) => void;
  onClose?: () => void;
  locale?: "en" | "ru";
  endpointBase?: string;
  webmOnly?: boolean;
  matchedMotion?: boolean;
  humanTuned?: boolean;
  regenerativeMotion?: boolean;
  readableRegenerative?: boolean;
};

const GLYPH = {
  circle: "●",
  triangle: "▲",
  diamond: "◆",
  star: "★",
} as const;

const WEBM_MIME_TYPE = 'video/webm; codecs="vp8"';
const MAX_BUFFER_AHEAD_SECONDS = 6;
const SEGMENT_FETCH_CONCURRENCY = 4;

function waitForEvent(
  target: EventTarget,
  eventName: string,
  signal: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    const handleEvent = () => {
      cleanup();
      resolve();
    };
    const handleAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const cleanup = () => {
      target.removeEventListener(eventName, handleEvent);
      signal.removeEventListener("abort", handleAbort);
    };
    target.addEventListener(eventName, handleEvent, { once: true });
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const handleAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

export function ServerMotionCaptcha({
  onPass,
  onClose,
  locale = "en",
  endpointBase = "/api/challenge",
  webmOnly = false,
  matchedMotion = false,
  humanTuned = false,
  regenerativeMotion = false,
  readableRegenerative = false,
}: ServerMotionCaptchaProps) {
  const aimCursorRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fallbackOffsetRef = useRef(0);
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
          server: readableRegenerative
            ? "WebM-пиксели · читаемый regenerative-сигнал · короткий хаотичный фон"
            : regenerativeMotion
            ? "WebM-пиксели · регенерация точек · кратковременный хаотичный flow"
            : humanTuned
            ? "WebM-пиксели · 3 decoy · облегчённый matched motion-фон"
            : matchedMotion
              ? "WebM-пиксели · 5 decoy-фигур · matched motion-фон"
            : webmOnly
              ? "Только WebM-пиксели · WSP1 не передаётся в браузер"
            : "Серверная проверка · ответ не передаётся в браузер",
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
          server: readableRegenerative
            ? "WebM pixels · readable regenerative signal · short chaotic background"
            : regenerativeMotion
            ? "WebM pixels · regenerated particles · short-lived chaotic flow"
            : humanTuned
            ? "WebM pixels · 3 decoys · lighter matched background motion"
            : matchedMotion
              ? "WebM pixels · 5 decoy shapes · matched background motion"
            : webmOnly
              ? "WebM pixels only · no WSP1 reaches the browser"
            : "Server verification · the answer stays off-device",
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
      const response = await fetch(endpointBase, {
        method: "POST",
        cache: "no-store",
        headers: { accept: "application/json" },
        signal,
      });
      if (!response.ok) throw new Error("Challenge request failed");
      const next = (await response.json()) as Challenge;
      if (signal?.aborted) return;
      if (
        next.shape !== "circle" &&
        next.shape !== "triangle" &&
        next.shape !== "diamond" &&
        next.shape !== "star"
      ) {
        throw new Error("Challenge metadata is invalid");
      }
      if (
        !next.id ||
        !next.width ||
        !next.height ||
        !next.fps ||
        !next.frameCount ||
        !next.segmentDurationMs ||
        !next.segmentCount ||
        !next.expiresAt ||
        !next.maxAttempts
      ) {
        throw new Error("Challenge metadata is incomplete");
      }
      if (
        webmOnly &&
        (next.transport !== "webm-only" || next.codec !== "vp8")
      ) {
        throw new Error("WebM-only transport metadata is invalid");
      }
      if (matchedMotion && next.variant !== "matched-motion-decoys") {
        throw new Error("Matched-motion variant metadata is invalid");
      }
      if (humanTuned && next.variant !== "human-tuned-decoys") {
        throw new Error("Human-tuned variant metadata is invalid");
      }
      if (regenerativeMotion && next.variant !== "regenerative-motion") {
        throw new Error("Regenerative-motion variant metadata is invalid");
      }
      if (
        readableRegenerative &&
        next.variant !== "regenerative-readable"
      ) {
        throw new Error("Readable regenerative variant metadata is invalid");
      }
      setChallenge(next);
      setSecondsLeft(
        Math.max(0, Math.ceil((next.expiresAt - Date.now()) / 1000)),
      );
    } catch {
      if (signal?.aborted) return;
      setStatus("error");
    }
  }, [
    endpointBase,
    humanTuned,
    matchedMotion,
    readableRegenerative,
    regenerativeMotion,
    webmOnly,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const startTimer = window.setTimeout(
      () => void loadChallenge(controller.signal),
      0,
    );
    return () => {
      window.clearTimeout(startTimer);
      controller.abort();
    };
  }, [loadChallenge]);

  useEffect(() => {
    const video = videoRef.current;
    if (!challenge || !video) return;
    const controller = new AbortController();
    const { signal } = controller;
    let mediaUrl: string | null = null;
    const fallbackUrls: string[] = [];

    const segmentUrl = (index: number) =>
      `${endpointBase}/${encodeURIComponent(challenge.id)}/segment/${index}`;
    const fetchSegment = async (index: number) => {
      const response = await fetch(segmentUrl(index), {
        cache: "no-store",
        headers: { accept: WEBM_MIME_TYPE },
        signal,
      });
      if (!response.ok) {
        throw new Error(`Video segment ${index} failed`);
      }
      return response.arrayBuffer();
    };

    const startFallbackPlayback = async () => {
      for (let index = 0; index < challenge.segmentCount; index += 1) {
        const segment = await fetchSegment(index);
        const url = URL.createObjectURL(
          new Blob([segment], { type: WEBM_MIME_TYPE }),
        );
        fallbackUrls.push(url);
        fallbackOffsetRef.current =
          (index * challenge.segmentDurationMs) / 1000;
        video.src = url;
        await video.play();
        if (index === 0) setStatus("playing");
        await waitForEvent(video, "ended", signal);
      }
    };

    const startBufferedPlayback = async () => {
      const mediaSource = new MediaSource();
      mediaUrl = URL.createObjectURL(mediaSource);
      video.src = mediaUrl;
      await waitForEvent(mediaSource, "sourceopen", signal);
      const sourceBuffer = mediaSource.addSourceBuffer(WEBM_MIME_TYPE);
      sourceBuffer.mode = "sequence";
      fallbackOffsetRef.current = 0;
      const pendingSegments = new Map<
        number,
        Promise<
          { success: true; data: ArrayBuffer } | { success: false; error: unknown }
        >
      >();
      const scheduleSegment = (index: number) => {
        if (
          index >= challenge.segmentCount ||
          pendingSegments.has(index)
        ) {
          return;
        }
        pendingSegments.set(
          index,
          fetchSegment(index).then(
            (data) => ({ success: true as const, data }),
            (error) => ({ success: false as const, error }),
          ),
        );
      };
      for (
        let index = 0;
        index < Math.min(
          SEGMENT_FETCH_CONCURRENCY,
          challenge.segmentCount,
        );
        index += 1
      ) {
        scheduleSegment(index);
      }

      for (let index = 0; index < challenge.segmentCount; index += 1) {
        const pending = pendingSegments.get(index);
        if (!pending) throw new Error(`Video segment ${index} was not queued`);
        const result = await pending;
        pendingSegments.delete(index);
        if (!result.success) throw result.error;
        scheduleSegment(index + SEGMENT_FETCH_CONCURRENCY);
        sourceBuffer.appendBuffer(result.data);
        await waitForEvent(sourceBuffer, "updateend", signal);
        if (index === 0) {
          await video.play();
          setStatus("playing");
        }
        while (
          sourceBuffer.buffered.length &&
          sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1) -
            video.currentTime >
            MAX_BUFFER_AHEAD_SECONDS
        ) {
          await wait(250, signal);
        }
      }
      if (mediaSource.readyState === "open" && !sourceBuffer.updating) {
        mediaSource.endOfStream();
      }
    };

    const start = async () => {
      try {
        if (
          "MediaSource" in window &&
          MediaSource.isTypeSupported(WEBM_MIME_TYPE)
        ) {
          await startBufferedPlayback();
        } else if (video.canPlayType(WEBM_MIME_TYPE)) {
          await startFallbackPlayback();
        } else {
          throw new Error("VP8 WebM playback is unavailable");
        }
      } catch (error) {
        if (!signal.aborted) {
          console.error("Unable to play CAPTCHA video", error);
          setStatus("error");
        }
      }
    };
    void start();

    return () => {
      controller.abort();
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (mediaUrl) URL.revokeObjectURL(mediaUrl);
      fallbackUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [challenge, endpointBase]);

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

  const handleClick = async (
    event: React.MouseEvent<HTMLVideoElement>,
  ) => {
    if (status !== "playing" || !challenge) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * challenge.width;
    const y = ((event.clientY - rect.top) / rect.height) * challenge.height;
    const elapsed =
      (fallbackOffsetRef.current + event.currentTarget.currentTime) * 1000;
    const frameIndex = Math.min(
      challenge.frameCount - 1,
      Math.floor((elapsed / 1000) * challenge.fps),
    );
    if (aimCursorRef.current) aimCursorRef.current.hidden = true;
    setStatus("verifying");

    try {
      const response = await fetch(
        `${endpointBase}/${encodeURIComponent(challenge.id)}/verify`,
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
    event: React.PointerEvent<HTMLVideoElement>,
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
          <video
            ref={videoRef}
            aria-label={`${copy.canvas}: ${copy.shape[challenge.shape]}.`}
            autoPlay
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
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
