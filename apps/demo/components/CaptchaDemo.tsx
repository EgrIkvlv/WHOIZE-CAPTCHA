"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MotionCaptcha } from "@whoize/captcha-react";
import { useCaptchaConfig } from "@/app/captcha-config";
import {
  LanguageSwitch,
  useLanguage,
} from "@/app/i18n";

type Proof = {
  id: string;
  expiresAt: number;
};

const COPY = {
  en: {
    how: "How it works",
    nav: "Primary navigation",
    kicker: "PROTOTYPE 02 · INTERACTIVE CHALLENGE",
    headline1: "Prove that",
    headline2: "you are human.",
    headline3: "In one motion.",
    intro:
      "An object is hidden inside a random field. A single frame contains no answer: the shape appears only when the eye connects dot motion over time.",
    principle1: "01 / one click",
    principle2: "02 / one result",
    principle3: "03 / fresh noise every time",
    protected: "PROTECTED ACTION",
    allowed: "ACTION ALLOWED",
    inside: "You are in.",
    accepted: "The demo form accepted the one-time proof.",
    repeat: "Run demo again",
    early: "Request early access",
    formHint: "The form unlocks only after a successful motion check.",
    name: "NAME",
    nameAria: "Name",
    proofReady: "Human proof ready",
    required: "Verification required",
    complete: "Complete action",
    continue: "Continue with WHOIZE",
    local: "Local MVP: proof is still verified in the browser.",
    metrics: "Prototype parameters",
    metric1: "CLICK PER CHALLENGE",
    metric2: "SECONDS UNTIL EXPIRY",
    metric3: "ATTEMPTS BEFORE LOCK",
    metric4: "FRAMES PER SECOND",
    stage: "HOW STAGE 1 WORKS",
    cycle: "A complete verification flow—without pretending it is secure.",
    challenge:
      "Every opening creates a new shape, position, direction, and noise field. You have 60 seconds to answer.",
    oneClick:
      "The first click ends the challenge. The hit is checked against the actual shape mask, not a rough radius.",
    proof:
      "Success creates a one-time local proof. Server verification and replay protection are the next stage.",
    openLab: "Open Motion Lab and tune the signal",
  },
  ru: {
    how: "Как работает",
    nav: "Основная навигация",
    kicker: "ПРОТОТИП 02 · ИНТЕРАКТИВНАЯ ПРОВЕРКА",
    headline1: "Докажите, что",
    headline2: "вы человек.",
    headline3: "Одним движением.",
    intro:
      "Объект спрятан в случайном поле. Один кадр не содержит ответа: фигура появляется только тогда, когда глаз связывает движение точек во времени.",
    principle1: "01 / один клик",
    principle2: "02 / один результат",
    principle3: "03 / новый шум каждый раз",
    protected: "ЗАЩИЩЁННОЕ ДЕЙСТВИЕ",
    allowed: "ДЕЙСТВИЕ РАЗРЕШЕНО",
    inside: "Вы внутри.",
    accepted: "Одноразовое доказательство принято демонстрационной формой.",
    repeat: "Повторить демо",
    early: "Запросить ранний доступ",
    formHint: "Форма откроется только после успешной motion-проверки.",
    name: "ИМЯ",
    nameAria: "Имя",
    proofReady: "Human proof готов",
    required: "Требуется проверка",
    complete: "Завершить действие",
    continue: "Продолжить с WHOIZE",
    local: "Локальный MVP: proof пока проверяется в браузере.",
    metrics: "Параметры прототипа",
    metric1: "КЛИК НА ИСПЫТАНИЕ",
    metric2: "СЕКУНД ДО ИСТЕЧЕНИЯ",
    metric3: "ПОПЫТКИ ДО ПАУЗЫ",
    metric4: "КАДРОВ В СЕКУНДУ",
    stage: "КАК УСТРОЕН ЭТАП 1",
    cycle: "Полный цикл проверки — без притворной безопасности.",
    challenge:
      "Каждое открытие создаёт новую фигуру, позицию, направление и поле шума. На ответ есть 60 секунд.",
    oneClick:
      "Первый клик завершает испытание. Попадание проверяется по реальной маске фигуры, а не по грубому радиусу.",
    proof:
      "Успех создаёт одноразовое локальное доказательство. Серверная версия и защита от replay — следующий этап.",
    openLab: "Открыть Motion Lab и настроить сигнал",
  },
} as const;

export function CaptchaDemo() {
  const { locale } = useLanguage();
  const copy = COPY[locale];
  const config = useCaptchaConfig();
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [proof, setProof] = useState<Proof | null>(null);
  const [actionComplete, setActionComplete] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const openChallenge = () => {
    if (proof && proof.expiresAt > Date.now()) {
      setActionComplete(true);
      return;
    }
    setProof(null);
    setActionComplete(false);
    setCaptchaOpen(true);
  };

  const handlePass = (token: string) => {
    setProof({
      id: token,
      expiresAt: Date.now() + config.proofTtlSeconds * 1000,
    });
    closeTimerRef.current = setTimeout(
      () => setCaptchaOpen(false),
      config.autoCloseDelayMs,
    );
  };

  return (
    <main className="demo-page">
      <header className="demo-nav">
        <Link className="brand" href="/" aria-label="WHOIZE CAPTCHA">
          WHOIZE<span>/</span>CAPTCHA
        </Link>
        <nav aria-label={copy.nav}>
          <a href="#how">{copy.how}</a>
          <Link href="/lab">Motion Lab</Link>
          <Link href="/admin">Admin</Link>
          <a
            href="https://github.com/EgrIkvlv/WHOIZE-CAPTCHA"
            target="_blank"
            rel="noreferrer"
          >
            GitHub ↗
          </a>
          <LanguageSwitch />
        </nav>
      </header>

      <section className="demo-hero">
        <div className="demo-copy">
          <div className="demo-kicker">
            <span className="status-dot" />
            {copy.kicker}
          </div>
          <h1>
            {copy.headline1}
            <br />
            {copy.headline2}
            <br />
            <em>{copy.headline3}</em>
          </h1>
          <p>{copy.intro}</p>
          <div className="demo-principles">
            <span>{copy.principle1}</span>
            <span>{copy.principle2}</span>
            <span>{copy.principle3}</span>
          </div>
        </div>

        <div className="protected-demo">
          <div className="demo-card-label">
            <span>{copy.protected}</span>
            <span>DEMO—SIGNUP</span>
          </div>

          {actionComplete ? (
            <div className="action-success" role="status">
              <span className="success-mark">✓</span>
              <div>
                <small>{copy.allowed}</small>
                <h2>{copy.inside}</h2>
                <p>{copy.accepted}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setProof(null);
                  setActionComplete(false);
                }}
              >
                {copy.repeat}
              </button>
            </div>
          ) : (
            <>
              <div className="demo-form-head">
                <span className="form-index">01</span>
                <div>
                  <h2>{copy.early}</h2>
                  <p>{copy.formHint}</p>
                </div>
              </div>

              <label className="demo-field">
                <span>{copy.name}</span>
                <input defaultValue="Research Visitor" aria-label={copy.nameAria} />
              </label>
              <label className="demo-field">
                <span>EMAIL</span>
                <input
                  type="email"
                  defaultValue="visitor@whoize.dev"
                  aria-label="Email"
                />
              </label>

              <div className={`proof-row ${proof ? "proof-ready" : ""}`}>
                <span className="proof-icon">{proof ? "✓" : "◇"}</span>
                <div>
                  <strong>
                    {proof ? copy.proofReady : copy.required}
                  </strong>
                  <small>
                    {proof
                      ? `TOKEN ${proof.id.slice(-8).toUpperCase()} · ${config.proofTtlSeconds} SEC`
                      : "WHOIZE MOTION CHALLENGE"}
                  </small>
                </div>
              </div>

              <button
                className="demo-submit"
                type="button"
                onClick={openChallenge}
              >
                <span>
                  {proof ? copy.complete : copy.continue}
                </span>
                <span>↗</span>
              </button>
              <p className="local-note">
                {copy.local}
              </p>
            </>
          )}
        </div>
      </section>

      <section className="demo-metrics" aria-label={copy.metrics}>
        <div>
          <strong>01</strong>
          <span>{copy.metric1}</span>
        </div>
        <div>
          <strong>{config.durationSeconds}</strong>
          <span>{copy.metric2}</span>
        </div>
        <div>
          <strong>{String(config.maxAttempts).padStart(2, "0")}</strong>
          <span>{copy.metric3}</span>
        </div>
        <div>
          <strong>{config.fps}</strong>
          <span>{copy.metric4}</span>
        </div>
      </section>

      <section className="how-section" id="how">
        <div className="how-heading">
          <span className="micro-label">{copy.stage}</span>
          <h2>{copy.cycle}</h2>
        </div>
        <div className="how-grid">
          <article>
            <span>01</span>
            <h3>Challenge</h3>
            <p>{copy.challenge}</p>
          </article>
          <article>
            <span>02</span>
            <h3>One click</h3>
            <p>{copy.oneClick}</p>
          </article>
          <article>
            <span>03</span>
            <h3>Proof</h3>
            <p>{copy.proof}</p>
          </article>
        </div>
        <Link className="lab-link" href="/lab">
          {copy.openLab} <span>→</span>
        </Link>
      </section>

      <footer className="demo-footer">
        <p>WHOIZE CAPTCHA · TEMPORAL PERCEPTION RESEARCH</p>
        <p>MIT LICENSE · CLIENT-SIDE MVP · 2026</p>
      </footer>

      {captchaOpen && (
        <div className="captcha-overlay">
          <div
            className="captcha-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="WHOIZE CAPTCHA"
          >
            <MotionCaptcha
              config={config}
              locale={locale}
              onPass={handlePass}
              onClose={() => setCaptchaOpen(false)}
            />
          </div>
        </div>
      )}
    </main>
  );
}
