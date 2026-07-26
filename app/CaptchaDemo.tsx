"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCaptchaConfig } from "./captcha-config";
import { MotionCaptcha } from "./MotionCaptcha";

type Proof = {
  id: string;
  expiresAt: number;
};

export function CaptchaDemo() {
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
        <nav aria-label="Основная навигация">
          <a href="#how">Как работает</a>
          <Link href="/lab">Motion Lab</Link>
          <Link href="/admin">Admin</Link>
          <a
            href="https://github.com/EgrIkvlv/WHOIZE-CAPTCHA"
            target="_blank"
            rel="noreferrer"
          >
            GitHub ↗
          </a>
        </nav>
      </header>

      <section className="demo-hero">
        <div className="demo-copy">
          <div className="demo-kicker">
            <span className="status-dot" />
            PROTOTYPE 02 · INTERACTIVE CHALLENGE
          </div>
          <h1>
            Докажите, что
            <br />
            вы человек.
            <br />
            <em>Одним движением.</em>
          </h1>
          <p>
            Объект спрятан в случайном поле. Один кадр не содержит ответа:
            фигура появляется только тогда, когда глаз связывает движение точек
            во времени.
          </p>
          <div className="demo-principles">
            <span>01 / один клик</span>
            <span>02 / один результат</span>
            <span>03 / новый шум каждый раз</span>
          </div>
        </div>

        <div className="protected-demo">
          <div className="demo-card-label">
            <span>ЗАЩИЩЁННОЕ ДЕЙСТВИЕ</span>
            <span>DEMO—SIGNUP</span>
          </div>

          {actionComplete ? (
            <div className="action-success" role="status">
              <span className="success-mark">✓</span>
              <div>
                <small>ДЕЙСТВИЕ РАЗРЕШЕНО</small>
                <h2>Вы внутри.</h2>
                <p>
                  Одноразовое доказательство принято демонстрационной формой.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setProof(null);
                  setActionComplete(false);
                }}
              >
                Повторить демо
              </button>
            </div>
          ) : (
            <>
              <div className="demo-form-head">
                <span className="form-index">01</span>
                <div>
                  <h2>Запросить ранний доступ</h2>
                  <p>
                    Форма откроется только после успешной motion-проверки.
                  </p>
                </div>
              </div>

              <label className="demo-field">
                <span>ИМЯ</span>
                <input defaultValue="Research Visitor" aria-label="Имя" />
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
                    {proof ? "Human proof готов" : "Требуется проверка"}
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
                  {proof ? "Завершить действие" : "Продолжить с WHOIZE"}
                </span>
                <span>↗</span>
              </button>
              <p className="local-note">
                Локальный MVP: proof пока проверяется в браузере.
              </p>
            </>
          )}
        </div>
      </section>

      <section className="demo-metrics" aria-label="Параметры прототипа">
        <div>
          <strong>01</strong>
          <span>КЛИК НА ИСПЫТАНИЕ</span>
        </div>
        <div>
          <strong>{config.durationSeconds}</strong>
          <span>СЕКУНД ДО ИСТЕЧЕНИЯ</span>
        </div>
        <div>
          <strong>{String(config.maxAttempts).padStart(2, "0")}</strong>
          <span>ПОПЫТКИ ДО ПАУЗЫ</span>
        </div>
        <div>
          <strong>{config.fps}</strong>
          <span>КАДРОВ В СЕКУНДУ</span>
        </div>
      </section>

      <section className="how-section" id="how">
        <div className="how-heading">
          <span className="micro-label">КАК УСТРОЕН ЭТАП 1</span>
          <h2>Полный цикл проверки — без притворной безопасности.</h2>
        </div>
        <div className="how-grid">
          <article>
            <span>01</span>
            <h3>Challenge</h3>
            <p>
              Каждое открытие создаёт новую фигуру, позицию, направление и поле
              шума. На ответ есть 60 секунд.
            </p>
          </article>
          <article>
            <span>02</span>
            <h3>One click</h3>
            <p>
              Первый клик завершает испытание. Попадание проверяется по реальной
              маске фигуры, а не по грубому радиусу.
            </p>
          </article>
          <article>
            <span>03</span>
            <h3>Proof</h3>
            <p>
              Успех создаёт одноразовое локальное доказательство. Серверная
              версия и защита от replay — следующий этап.
            </p>
          </article>
        </div>
        <Link className="lab-link" href="/lab">
          Открыть Motion Lab и настроить сигнал <span>→</span>
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
              onPass={handlePass}
              onClose={() => setCaptchaOpen(false)}
            />
          </div>
        </div>
      )}
    </main>
  );
}
