"use client";

import Link from "next/link";
import { useState } from "react";
import { MotionCaptcha } from "@whoize/captcha-react";
import { useCaptchaConfig } from "@/app/captcha-config";
import { LanguageSwitch, useLanguage } from "@/app/i18n";
import { ServerMotionCaptcha } from "@/apps/demo/components/ServerMotionCaptcha";
import { LegacyApngCaptcha } from "./LegacyApngCaptcha";
import { SparseFramesCaptcha } from "./SparseFramesCaptcha";

type VersionId = "canvas" | "apng" | "webm" | "sparse";

const COPY = {
  en: {
    nav: "Versions navigation",
    back: "Home",
    lab: "Motion Lab",
    kicker: "LIVE ARCHITECTURE ARCHIVE · 04 RUNNABLE BUILDS",
    title: "CAPTCHA\nVersions",
    intro:
      "The same motion idea, implemented four different ways. Launch every preserved build, compare the real trade-offs, and use the archive as a baseline for the next iteration.",
    current: "CURRENT",
    archived: "ARCHIVED",
    launch: "Launch version",
    close: "Close comparison",
    pros: "Advantages",
    cons: "Limitations",
    architecture: "Architecture",
    measured: "Observed prototype metrics",
    note:
      "Numbers describe the current Readable profile and our deployed prototype—not universal performance guarantees. Network and cold-start latency vary by host.",
    matrix: "Comparison matrix",
    criterion: "Criterion",
    rows: {
      fidelity: "Visual fidelity",
      exposure: "Answer in browser state",
      traffic: "Challenge media traffic",
      compute: "Server compute",
      motion: "Motion continuity",
      security: "Security posture",
    },
    verdict: {
      canvas:
        "Best perception baseline. Keep it for tuning the visual signal, never as the production security boundary.",
      apng:
        "Useful low-traffic server-rendered baseline. Its compressed resolution and repeating path visibly weaken the experiment.",
      webm:
        "A strong server-pixel baseline, but its static background and VP8 encoding move away from the original dynamic-noise experiment.",
      sparse:
        "The closest server-authoritative build to the original visual idea. Its exact point stream is cheaper to generate, but easier for a purpose-built solver to parse.",
    },
    versions: {
      canvas: {
        name: "Client Canvas",
        version: "v1.0",
        subtitle: "The original perception prototype",
        summary:
          "The browser generates every dot, mask, center, and trajectory locally on a 2D canvas.",
        architecture:
          "React + Canvas · client rendering · client hit testing",
        metrics: [
          ["Frame", "640×360"],
          ["Signal", "7,200 dots · 2.4 px"],
          ["Motion", "48 fps · continuous"],
          ["Media", "≈ 0 B per challenge"],
          ["Start", "Immediate"],
        ],
        pros: [
          "Highest responsiveness and smoothest continuous motion",
          "No challenge rendering cost on the server",
          "Ideal reference for perception and parameter tuning",
        ],
        cons: [
          "Mask, center, trajectory, and hit test are readable in JavaScript",
          "A bot can bypass perception and call the success path directly",
          "Not suitable as a production CAPTCHA",
        ],
      },
      apng: {
        name: "Server APNG",
        version: "v1.1",
        subtitle: "The first server-rendered experiment",
        summary:
          "The server renders a complete three-second animation and sends one self-contained APNG to the browser.",
        architecture:
          "Server pixels · APNG response · server frame verification",
        metrics: [
          ["Frame", "384×216"],
          ["Signal", "2,592 dots · 1.44 px"],
          ["Motion", "16 fps · 3 s loop"],
          ["Media", "≈ 0.42 MB once"],
          ["Render", "≈ 0.23 s local"],
        ],
        pros: [
          "Browser receives pixels instead of the private mask",
          "One compact request can repeat without more traffic",
          "Simple playback with broad image support",
        ],
        cons: [
          "Resolution, density, and frame rate are heavily reduced",
          "The object jumps when the three-second path loops",
          "Full-quality high-fps APNG scales poorly in size",
        ],
      },
      webm: {
        name: "Server WebM",
        version: "v1.2",
        subtitle: "The current continuous server stream",
        summary:
          "The server renders one-second VP8 segments from a single private trajectory; the browser buffers four segments in parallel.",
        architecture:
          "Server pixels · VP8/WebM segments · MSE buffer · server verification",
        metrics: [
          ["Frame", "640×360"],
          ["Signal", "7,200 dots · 2.4 px"],
          ["Motion", "48 fps · continuous"],
          ["Media", "≈ 0.32–0.44 MB/s"],
          ["Buffer", "4 parallel segments"],
        ],
        pros: [
          "Restores the original visual quality and real 48 fps",
          "Mask, velocity, seeds, and hit testing stay on the server",
          "One continuous path without a loop-boundary teleport",
        ],
        cons: [
          "Approximately 19–26 MB of media for a full minute",
          "VP8 encoding creates meaningful serverless CPU cost",
          "Cold start and browser codec support require buffering and fallback",
        ],
      },
      sparse: {
        name: "Sparse Frames",
        version: "v1.3a",
        subtitle: "Server occupancy frames · four-second loop",
        summary:
          "The server mixes target and background into a flat set of occupied cells for every frame. The browser receives no particle identities and only draws the final result.",
        architecture:
          "Server scene · binary gap/varint frames · Canvas playback · server verification",
        metrics: [
          ["Frame", "640×360"],
          ["Signal", "7,200 cells · 2.4 px"],
          ["Motion", "48 fps · seamless 4 s loop"],
          ["Noise", "100% fresh each frame"],
          ["Media", "≈ 1.41 MB once"],
        ],
        pros: [
          "Restores fully regenerated background noise at full fidelity",
          "No VP8 encoding, codec artifacts, or MSE buffering",
          "Mask, seed, particle roles, trajectory, and hit test stay server-side",
        ],
        cons: [
          "Exact occupied cells remove thresholding work for a solver",
          "Repeated viewing gives a bot the complete four-second sequence",
          "The human-versus-solver advantage still needs a benchmark",
        ],
      },
    },
    matrixValues: {
      canvas: ["High", "Yes", "Minimal", "None", "Continuous", "Low"],
      apng: ["Reduced", "No", "≈ 0.42 MB once", "One burst", "3 s loop", "Medium"],
      webm: ["High", "No", "≈ 0.4 MB/s", "Continuous", "Continuous", "High"],
      sparse: ["High", "No", "≈ 1.41 MB once", "One burst", "4 s loop", "Best current"],
    },
  },
  ru: {
    nav: "Навигация по версиям",
    back: "Главная",
    lab: "Motion Lab",
    kicker: "ЖИВОЙ АРХИВ АРХИТЕКТУР · 04 РАБОЧИЕ СБОРКИ",
    title: "Версии\nCAPTCHA",
    intro:
      "Одна motion-идея, реализованная четырьмя способами. Каждую сохранённую сборку можно запустить, сравнить реальные компромиссы и использовать как основу следующей итерации.",
    current: "ТЕКУЩАЯ",
    archived: "АРХИВ",
    launch: "Запустить версию",
    close: "Закрыть сравнение",
    pros: "Плюсы",
    cons: "Ограничения",
    architecture: "Архитектура",
    measured: "Измеренные параметры прототипа",
    note:
      "Цифры относятся к текущему профилю «Читаемый» и нашим деплоям, а не являются универсальной гарантией. Сеть и холодный старт зависят от хостинга.",
    matrix: "Матрица сравнения",
    criterion: "Критерий",
    rows: {
      fidelity: "Качество изображения",
      exposure: "Ответ в состоянии браузера",
      traffic: "Медиатрафик challenge",
      compute: "Расчёты сервера",
      motion: "Непрерывность движения",
      security: "Уровень защищённости",
    },
    verdict: {
      canvas:
        "Лучший эталон восприятия. Оставляем для настройки сигнала, но не используем как production-границу безопасности.",
      apng:
        "Полезный серверный baseline с небольшим трафиком. Сниженное качество и повторяющийся путь заметно портят эксперимент.",
      webm:
        "Сильный baseline с серверными пикселями, но статичный фон и VP8-кодирование уводят его от исходного эксперимента с динамическим шумом.",
      sparse:
        "Самая близкая к исходной визуальной идее серверная версия. Точный point-stream дешевле генерировать, но специализированному solver проще его разобрать.",
    },
    versions: {
      canvas: {
        name: "Client Canvas",
        version: "v1.0",
        subtitle: "Первый прототип восприятия",
        summary:
          "Браузер сам генерирует все точки, маску, центр и траекторию в 2D canvas.",
        architecture:
          "React + Canvas · рендер в браузере · проверка в браузере",
        metrics: [
          ["Кадр", "640×360"],
          ["Сигнал", "7 200 точек · 2.4 px"],
          ["Движение", "48 fps · непрерывное"],
          ["Медиа", "≈ 0 Б на challenge"],
          ["Запуск", "Мгновенно"],
        ],
        pros: [
          "Максимальная отзывчивость и самое плавное движение",
          "Нет серверной стоимости рендера challenge",
          "Идеальный эталон для настройки восприятия",
        ],
        cons: [
          "Маску, центр, траекторию и hit test видно в JavaScript",
          "Бот может обойти восприятие и вызвать успешный путь напрямую",
          "Не подходит как production CAPTCHA",
        ],
      },
      apng: {
        name: "Server APNG",
        version: "v1.1",
        subtitle: "Первый серверный эксперимент",
        summary:
          "Сервер целиком рендерит трёхсекундную анимацию и отправляет один самостоятельный APNG.",
        architecture:
          "Серверные пиксели · APNG · проверка кадра на сервере",
        metrics: [
          ["Кадр", "384×216"],
          ["Сигнал", "2 592 точки · 1.44 px"],
          ["Движение", "16 fps · цикл 3 с"],
          ["Медиа", "≈ 0.42 МБ один раз"],
          ["Рендер", "≈ 0.23 с локально"],
        ],
        pros: [
          "Браузер получает пиксели вместо приватной маски",
          "Один компактный запрос повторяется без нового трафика",
          "Простое воспроизведение с широкой поддержкой изображений",
        ],
        cons: [
          "Разрешение, плотность и частота кадров сильно снижены",
          "Фигура прыгает на границе трёхсекундного цикла",
          "Полноразмерный APNG с высоким fps быстро растёт в размере",
        ],
      },
      webm: {
        name: "Server WebM",
        version: "v1.2",
        subtitle: "Текущий непрерывный серверный поток",
        summary:
          "Сервер рендерит секундные VP8-сегменты одной приватной траектории; браузер параллельно буферизует четыре сегмента.",
        architecture:
          "Серверные пиксели · VP8/WebM · MSE-буфер · серверная проверка",
        metrics: [
          ["Кадр", "640×360"],
          ["Сигнал", "7 200 точек · 2.4 px"],
          ["Движение", "48 fps · непрерывное"],
          ["Медиа", "≈ 0.32–0.44 МБ/с"],
          ["Буфер", "4 параллельных сегмента"],
        ],
        pros: [
          "Возвращает исходное качество и настоящие 48 fps",
          "Маска, скорость, seed и hit test остаются на сервере",
          "Единый путь без телепортации на границе цикла",
        ],
        cons: [
          "Примерно 19–26 МБ медиа за полную минуту",
          "VP8-кодирование создаёт заметную serverless-нагрузку",
          "Холодный старт и поддержка кодека требуют буфера и fallback",
        ],
      },
      sparse: {
        name: "Sparse Frames",
        version: "v1.3a",
        subtitle: "Серверные occupancy-кадры · цикл четыре секунды",
        summary:
          "Сервер смешивает фигуру и фон в плоский набор занятых клеток для каждого кадра. Браузер не получает идентификаторы частиц и только рисует финальный результат.",
        architecture:
          "Серверная сцена · бинарные gap/varint-кадры · Canvas · серверная проверка",
        metrics: [
          ["Кадр", "640×360"],
          ["Сигнал", "7 200 клеток · 2.4 px"],
          ["Движение", "48 fps · бесшовный цикл 4 с"],
          ["Шум", "100% новый каждый кадр"],
          ["Медиа", "≈ 1.41 МБ один раз"],
        ],
        pros: [
          "Возвращает полностью обновляемый фон в исходном качестве",
          "Нет VP8-кодирования, артефактов кодека и MSE-буфера",
          "Маска, seed, роли частиц, траектория и hit test остаются на сервере",
        ],
        cons: [
          "Точные клетки убирают для solver этап выделения точек из растра",
          "Повторы дают боту всю четырёхсекундную последовательность",
          "Преимущество человека перед solver ещё нужно измерить",
        ],
      },
    },
    matrixValues: {
      canvas: ["Высокое", "Да", "Минимальный", "Нет", "Непрерывное", "Низкий"],
      apng: ["Сниженное", "Нет", "≈ 0.42 МБ один раз", "Один пик", "Цикл 3 с", "Средний"],
      webm: ["Высокое", "Нет", "≈ 0.4 МБ/с", "Постоянные", "Непрерывное", "Высокий"],
      sparse: ["Высокое", "Нет", "≈ 1.41 МБ один раз", "Один пик", "Цикл 4 с", "Лучший сейчас"],
    },
  },
} as const;

const VERSION_IDS: VersionId[] = ["canvas", "apng", "webm", "sparse"];

export function CaptchaVersions() {
  const { locale } = useLanguage();
  const copy = COPY[locale];
  const config = useCaptchaConfig();
  const [activeVersion, setActiveVersion] = useState<VersionId | null>(null);
  const rowLabels = Object.values(copy.rows);

  return (
    <main className="versions-page">
      <header className="versions-nav">
        <Link className="brand" href="/" aria-label="WHOIZE CAPTCHA">
          WHOIZE<span>/</span>VERSIONS
        </Link>
        <nav aria-label={copy.nav}>
          <Link href="/">{copy.back}</Link>
          <Link href="/lab">{copy.lab}</Link>
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

      <section className="versions-hero">
        <p className="eyebrow">{copy.kicker}</p>
        <div>
          <h1>
            {copy.title.split("\n").map((line, index) => (
              <span key={line}>
                {index > 0 && <br />}
                {line}
              </span>
            ))}
          </h1>
          <p>{copy.intro}</p>
        </div>
      </section>

      <section className="version-grid" aria-label={copy.measured}>
        {VERSION_IDS.map((id, index) => {
          const version = copy.versions[id];
          const current = id === "sparse";
          return (
            <article className={`version-card version-${id}`} key={id}>
              <div className="version-card-head">
                <span>{version.version}</span>
                <span className={current ? "current" : ""}>
                  {current ? copy.current : copy.archived}
                </span>
              </div>
              <div className="version-index">0{index + 1}</div>
              <h2>{version.name}</h2>
              <p className="version-subtitle">{version.subtitle}</p>
              <p className="version-summary">{version.summary}</p>

              <div className="version-architecture">
                <small>{copy.architecture}</small>
                <strong>{version.architecture}</strong>
              </div>

              <dl className="version-metrics">
                {version.metrics.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="version-lists">
                <div>
                  <h3>
                    <span>+</span> {copy.pros}
                  </h3>
                  <ul>
                    {version.pros.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="negative">
                    <span>−</span> {copy.cons}
                  </h3>
                  <ul>
                    {version.cons.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <p className="version-verdict">{copy.verdict[id]}</p>
              <button
                type="button"
                className="version-launch"
                onClick={() => setActiveVersion(id)}
              >
                <span>{copy.launch}</span>
                <span>↗</span>
              </button>
            </article>
          );
        })}
      </section>

      <section className="version-matrix-section">
        <div className="matrix-title">
          <p className="eyebrow">{copy.measured}</p>
          <h2>{copy.matrix}</h2>
        </div>
        <div className="version-matrix-wrap">
          <table className="version-matrix">
            <thead>
              <tr>
                <th>{copy.criterion}</th>
                {VERSION_IDS.map((id) => (
                  <th key={id}>
                    <span>{copy.versions[id].version}</span>
                    {copy.versions[id].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowLabels.map((label, rowIndex) => (
                <tr key={label}>
                  <th>{label}</th>
                  {VERSION_IDS.map((id) => (
                    <td key={id}>{copy.matrixValues[id][rowIndex]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="versions-note">{copy.note}</p>
      </section>

      {activeVersion && (
        <div
          className="version-modal"
          role="dialog"
          aria-modal="true"
          aria-label={copy.versions[activeVersion].name}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setActiveVersion(null);
          }}
        >
          <div className="version-modal-shell">
            <div className="version-modal-label">
              <div>
                <span>{copy.versions[activeVersion].version}</span>
                <strong>{copy.versions[activeVersion].name}</strong>
              </div>
              <button
                type="button"
                onClick={() => setActiveVersion(null)}
                aria-label={copy.close}
              >
                ×
              </button>
            </div>
            {activeVersion === "canvas" ? (
              <MotionCaptcha
                config={config}
                locale={locale}
                onPass={() => undefined}
                onClose={() => setActiveVersion(null)}
              />
            ) : activeVersion === "apng" ? (
              <LegacyApngCaptcha
                locale={locale}
                onClose={() => setActiveVersion(null)}
              />
            ) : activeVersion === "webm" ? (
              <ServerMotionCaptcha
                locale={locale}
                onPass={() => undefined}
                onClose={() => setActiveVersion(null)}
              />
            ) : (
              <SparseFramesCaptcha
                locale={locale}
                onClose={() => setActiveVersion(null)}
              />
            )}
          </div>
        </div>
      )}
    </main>
  );
}
