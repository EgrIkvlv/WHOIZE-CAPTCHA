"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { MotionCaptcha } from "@whoize/captcha-react";
import { useCaptchaConfig } from "@/app/captcha-config";
import { LanguageSwitch, useLanguage } from "@/app/i18n";
import { ServerMotionCaptcha } from "@/apps/demo/components/ServerMotionCaptcha";
import { LegacyApngCaptcha } from "./LegacyApngCaptcha";
import { SparseFramesCaptcha } from "./SparseFramesCaptcha";

type VersionId =
  | "canvas"
  | "apng"
  | "webm"
  | "sparse"
  | "blur"
  | "webm14"
  | "webm15"
  | "webm15b";

const COPY = {
  en: {
    nav: "Versions navigation",
    back: "Home",
    lab: "Motion Lab",
    kicker: "LIVE ARCHITECTURE ARCHIVE · 08 RUNNABLE BUILDS",
    title: "CAPTCHA\nVersions",
    intro:
      "The same motion idea, implemented eight different ways. Launch every preserved build, compare the real trade-offs, and use the archive as a baseline for the next iteration.",
    current: "CURRENT",
    archived: "ARCHIVED",
    experiment: "EXPERIMENT",
    launch: "Open",
    relaunch: "Relaunch CAPTCHA",
    live: "Live challenge",
    details: "Version details",
    close: "Close comparison",
    pros: "Advantages",
    cons: "Limitations",
    architecture: "Architecture",
    measured: "Observed prototype metrics",
    note:
      "Attack percentages are bot pass rates, so lower is better. Numbers describe the current Readable profile and our deployed prototype—not universal performance guarantees.",
    matrix: "Comparison matrix",
    criterion: "Criterion",
    attackTest: "Best attack pass rate",
    blurControl: "Browser blur",
    blurHint:
      "Applied only to the decoded sparse Canvas. The private scene, frame stream, and server verification stay identical to v1.3a.",
    rows: {
      fidelity: "Visual fidelity",
      exposure: "Answer in browser state",
      traffic: "Challenge media traffic",
      compute: "Server compute",
      motion: "Motion continuity",
      security: "Security posture",
    },
    benchmarks: {
      canvas: {
        score: "BYPASSABLE",
        detail: "Source audit · answer in client",
        tone: "danger",
      },
      apng: {
        score: "NOT RUN",
        detail: "0 dedicated scenes",
        tone: "pending",
      },
      webm: {
        score: "NOT RUN",
        detail: "0 dedicated scenes",
        tone: "pending",
      },
      sparse: {
        score: "100% PASS",
        detail: "24 scenes · coherent flow",
        tone: "danger",
      },
      blur: {
        score: "100% PASS",
        detail: "24 scenes · removable blur",
        tone: "danger",
      },
      webm14: {
        score: "100% PASS",
        detail: "24 WebM · frame difference",
        tone: "danger",
      },
      webm15: {
        score: "58.3% PASS",
        detail: "24 WebM · shape template",
        tone: "warning",
      },
      webm15b: {
        score: "54.2% PASS",
        detail: "24 WebM · shape template",
        tone: "warning",
      },
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
      blur:
        "The v1.3a security boundary with a softer presentation layer. Useful for measuring eye strain and readability; the removable CSS filter itself adds no security.",
      webm14:
        "The first v1.3-quality build that removes the exact point stream from client state. It closes the WSP1 shortcut, but pixel-level computer vision remains the next measured attack surface.",
      webm15:
        "The first version that changes the visual signal itself: five motion-matched decoy shapes and a moving background remove the single obvious coherent region. Human readability and stronger shape-aware attacks now need measurement.",
      webm15b:
        "A usability-first branch of v1.5. It intentionally reduces visual load while preserving several matched candidates. The benchmark confirms the security cost; only a human study can now tell whether the usability gain is worth it.",
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
      blur: {
        name: "Sparse + Browser Blur",
        version: "v1.3b",
        subtitle: "v1.3a with adjustable browser softness",
        summary:
          "The exact v1.3a server-generated sparse frame sequence is displayed through a light CSS blur that can be tuned live.",
        architecture:
          "v1.3a server sparse frames · Canvas CSS filter · server verification",
        metrics: [
          ["Base", "v1.3a Sparse Frames"],
          ["Frame", "640×360 · 48 fps"],
          ["Blur", "0–4 px · live"],
          ["Default", "1.2 px"],
          ["Media", "≈ 1.41 MB once"],
        ],
        pros: [
          "Softens the harsh high-frequency sparse field without new server work",
          "Blur can be tuned live without restarting the challenge",
          "Keeps v1.3a fresh noise, seamless loop, and server-side hit testing",
        ],
        cons: [
          "Too much blur can hide the motion signal together with the noise",
          "CSS blur is cosmetic and trivial for a bot to disable",
          "Keeps v1.3a point-stream exposure and solver trade-offs",
        ],
      },
      webm14: {
        name: "Dynamic WebM Only",
        version: "v1.4",
        subtitle: "Fresh server noise · pixels are the only client input",
        summary:
          "The server renders a private continuous scene with regenerated noise on every frame and sends only one-second VP8/WebM segments to the browser.",
        architecture:
          "Private server scene · dynamic raster frames · VP8/WebM segments · MSE playback · server verification",
        metrics: [
          ["Frame", "640×360"],
          ["Signal", "7,200 dots · 2.4 px"],
          ["Motion", "48 fps · non-looping"],
          ["Media", "≈ 1.20 MB/s"],
          ["Solver", "100% · two-frame diff"],
        ],
        pros: [
          "No WSP1 cells, mask, seed, center, or trajectory enter client state",
          "Keeps full-quality dynamic noise instead of v1.2's stable background",
          "Private server hit testing and one-time proof flow remain intact",
        ],
        cons: [
          "Dynamic noise is expensive for both VP8 bitrate and server encoding",
          "A solver can still record decoded frames and run optical flow",
          "Cold-start latency and sustained segment rendering require measurement",
        ],
      },
      webm15: {
        name: "Matched Motion Decoys",
        version: "v1.5",
        subtitle: "Six coherent shapes · motion-matched background",
        summary:
          "The target moves beside five decoy shapes with comparable density, speed, and persistence. Most background points also move continuously, so raw frame difference and global optical flow no longer isolate one special region.",
        architecture:
          "Private target + decoy scene · matched particle motion · VP8/WebM only · server verification",
        metrics: [
          ["Frame", "640×360 · 48 fps"],
          ["Clusters", "1 target + 5 decoys"],
          ["Media", "≈ 1.17 MB/s"],
          ["Old attacks", "0–16.7%"],
          ["Shape-aware", "58.3%"],
        ],
        pros: [
          "Removes the unique low-change window exploited against v1.4",
          "Gives coherent-flow solvers several statistically similar candidates",
          "Keeps the target, seed, trajectories, and hit test on the server",
        ],
        cons: [
          "The denser moving scene may increase human search time and eye strain",
          "Shape classification can still distinguish the requested target",
          "Security and usability claims require direct benchmark and human testing",
        ],
      },
      webm15b: {
        name: "Human-Tuned Decoys",
        version: "v1.5b",
        subtitle: "Three decoys · lighter matched-motion field",
        summary:
          "A readability-focused v1.5 branch with three decoys, 6,200 dots, larger shapes, and a lower share of continuously moving background points. Candidate paths are selected to stay separated during the first eight seconds.",
        architecture:
          "Human-tuned private scene · separated matched clusters · VP8/WebM only · server verification",
        metrics: [
          ["Frame", "640×360 · 48 fps"],
          ["Clusters", "1 target + 3 decoys"],
          ["Signal", "6,200 dots · 74–82+ px"],
          ["Media", "≈ 1.12 MB/s · 1.04 s encode"],
          ["Attacks", "33.3–54.2% adapted"],
        ],
        pros: [
          "Reduces simultaneous candidates and whole-field motion",
          "Larger shapes and early path separation improve visual acquisition",
          "Keeps target, decoys, trajectories, and verification server-side",
        ],
        cons: [
          "Fewer candidates increase the solver's random cluster odds",
          "Larger cleaner shapes may help shape-template classification",
          "Human comfort still requires direct testing rather than inference",
        ],
      },
    },
    matrixValues: {
      canvas: ["High", "Yes", "Minimal", "None", "Continuous", "Low"],
      apng: ["Reduced", "No", "≈ 0.42 MB once", "One burst", "3 s loop", "Medium"],
      webm: ["High", "No", "≈ 0.4 MB/s", "Continuous", "Continuous", "High"],
      sparse: ["High", "No", "≈ 1.41 MB once", "One burst", "4 s loop", "Best current"],
      blur: ["Softened", "No", "≈ 1.41 MB once", "One burst", "4 s loop", "Best current"],
      webm14: ["High", "No", "≈ 1.20 MB/s", "≈ 1.23 s/segment", "Non-looping", "CV: 100%"],
      webm15: ["High / busy", "No", "≈ 1.17 MB/s", "≈ 1.04 s/segment", "Non-looping", "CV: 58.3% best"],
      webm15b: ["High / calmer", "No", "≈ 1.12 MB/s", "≈ 1.03 s/segment", "Non-looping", "CV: 54.2% best"],
    },
  },
  ru: {
    nav: "Навигация по версиям",
    back: "Главная",
    lab: "Motion Lab",
    kicker: "ЖИВОЙ АРХИВ АРХИТЕКТУР · 08 РАБОЧИХ СБОРОК",
    title: "Версии\nCAPTCHA",
    intro:
      "Одна motion-идея, реализованная восемью способами. Каждую сохранённую сборку можно запустить, сравнить реальные компромиссы и использовать как основу следующей итерации.",
    current: "ТЕКУЩАЯ",
    archived: "АРХИВ",
    experiment: "ЭКСПЕРИМЕНТ",
    launch: "Открыть",
    relaunch: "Перезапустить CAPTCHA",
    live: "Рабочая CAPTCHA",
    details: "Подробности версии",
    close: "Закрыть сравнение",
    pros: "Плюсы",
    cons: "Ограничения",
    architecture: "Архитектура",
    measured: "Измеренные параметры прототипа",
    note:
      "Проценты атак — это доля успешных прохождений ботом: чем ниже, тем лучше. Цифры относятся к профилю «Читаемый» и нашим деплоям, а не являются универсальной гарантией.",
    matrix: "Матрица сравнения",
    criterion: "Критерий",
    attackTest: "Проход лучшей атаки",
    blurControl: "Блюр в браузере",
    blurHint:
      "Применяется только к декодированному sparse Canvas. Приватная сцена, поток кадров и серверная проверка остаются как в v1.3a.",
    rows: {
      fidelity: "Качество изображения",
      exposure: "Ответ в состоянии браузера",
      traffic: "Медиатрафик challenge",
      compute: "Расчёты сервера",
      motion: "Непрерывность движения",
      security: "Уровень защищённости",
    },
    benchmarks: {
      canvas: {
        score: "ОБХОДИМА",
        detail: "Аудит кода · ответ в клиенте",
        tone: "danger",
      },
      apng: {
        score: "НЕТ ТЕСТА",
        detail: "0 отдельных сцен",
        tone: "pending",
      },
      webm: {
        score: "НЕТ ТЕСТА",
        detail: "0 отдельных сцен",
        tone: "pending",
      },
      sparse: {
        score: "100% ПРОХОД",
        detail: "24 сцены · coherent flow",
        tone: "danger",
      },
      blur: {
        score: "100% ПРОХОД",
        detail: "24 сцены · снимаемый blur",
        tone: "danger",
      },
      webm14: {
        score: "100% ПРОХОД",
        detail: "24 WebM · разность кадров",
        tone: "danger",
      },
      webm15: {
        score: "58.3% ПРОХОД",
        detail: "24 WebM · шаблон формы",
        tone: "warning",
      },
      webm15b: {
        score: "54.2% ПРОХОД",
        detail: "24 WebM · шаблон формы",
        tone: "warning",
      },
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
      blur:
        "Граница безопасности v1.3a с более мягким визуальным слоем. Полезно для измерения нагрузки на глаза и читаемости; снимаемый CSS-фильтр сам по себе защиты не добавляет.",
      webm14:
        "Первая версия с качеством v1.3, которая убирает точный point-stream из состояния клиента. WSP1-shortcut закрыт, но следующим объектом измерения остаётся компьютерное зрение по пикселям.",
      webm15:
        "Первая версия, которая меняет сам визуальный сигнал: пять motion-matched decoy-фигур и движущийся фон убирают единственную очевидную когерентную область. Теперь нужно измерить читаемость для людей и более сильные shape-aware атаки.",
      webm15b:
        "Ориентированная на удобство ветка v1.5. Она специально снижает визуальную нагрузку, сохраняя несколько matched-кандидатов. Benchmark подтвердил цену для защиты; теперь только тест на людях покажет, оправдан ли выигрыш в удобстве.",
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
      blur: {
        name: "Sparse + Browser Blur",
        version: "v1.3b",
        subtitle: "v1.3a с регулируемой мягкостью в браузере",
        summary:
          "Та же серверная последовательность sparse-кадров из v1.3a отображается через лёгкий CSS-blur, который можно менять на лету.",
        architecture:
          "Sparse-кадры v1.3a на сервере · CSS-фильтр Canvas · серверная проверка",
        metrics: [
          ["Основа", "v1.3a Sparse Frames"],
          ["Кадр", "640×360 · 48 fps"],
          ["Блюр", "0–4 px · live"],
          ["По умолчанию", "1.2 px"],
          ["Медиа", "≈ 1.41 МБ один раз"],
        ],
        pros: [
          "Смягчает резкое sparse-поле без новых расчётов сервера",
          "Степень блюра меняется на лету без перезапуска challenge",
          "Сохраняет новый шум, бесшовный цикл и серверный hit test из v1.3a",
        ],
        cons: [
          "Сильный blur скрывает не только шум, но и motion-сигнал",
          "CSS-blur косметический и легко отключается ботом",
          "Сохраняются point-stream exposure и solver-компромиссы v1.3a",
        ],
      },
      webm14: {
        name: "Dynamic WebM Only",
        version: "v1.4",
        subtitle: "Свежий серверный шум · клиент получает только пиксели",
        summary:
          "Сервер рендерит приватную непрерывную сцену с новым шумом на каждом кадре и отправляет браузеру только секундные VP8/WebM-сегменты.",
        architecture:
          "Приватная серверная сцена · динамические растровые кадры · VP8/WebM · MSE · серверная проверка",
        metrics: [
          ["Кадр", "640×360"],
          ["Сигнал", "7 200 точек · 2.4 px"],
          ["Движение", "48 fps · без цикла"],
          ["Медиа", "≈ 1.20 МБ/с"],
          ["Solver", "100% · разность кадров"],
        ],
        pros: [
          "WSP1, маска, seed, центр и траектория не попадают в состояние клиента",
          "Сохраняет динамический шум полного качества вместо стабильного фона v1.2",
          "Серверный hit test и одноразовый proof остаются приватными",
        ],
        cons: [
          "Динамический шум дорог для VP8-трафика и серверного кодирования",
          "Solver всё ещё может записать кадры и применить optical flow",
          "Нужно измерить cold start и постоянную стоимость рендера сегментов",
        ],
      },
      webm15: {
        name: "Matched Motion Decoys",
        version: "v1.5",
        subtitle: "Шесть когерентных фигур · motion-matched фон",
        summary:
          "Цель движется рядом с пятью ложными фигурами сопоставимой плотности, скорости и устойчивости. Большая часть фоновых точек тоже движется непрерывно, поэтому простая разность кадров и глобальный optical flow больше не выделяют одну особую область.",
        architecture:
          "Приватная сцена цели и decoy · matched motion частиц · только VP8/WebM · серверная проверка",
        metrics: [
          ["Кадр", "640×360 · 48 fps"],
          ["Кластеры", "1 цель + 5 decoy"],
          ["Медиа", "≈ 1.17 МБ/с"],
          ["Старые атаки", "0–16.7%"],
          ["Shape-aware", "58.3%"],
        ],
        pros: [
          "Убирает уникальное low-change окно, на котором ломалась v1.4",
          "Даёт coherent-flow solver несколько статистически похожих кандидатов",
          "Цель, seed, траектории и hit test остаются на сервере",
        ],
        cons: [
          "Более насыщенная сцена может увеличить время поиска и нагрузку на глаза",
          "Классификация формы всё ещё может отличить нужную цель",
          "Защиту и удобство нужно подтвердить benchmark и тестами на людях",
        ],
      },
      webm15b: {
        name: "Human-Tuned Decoys",
        version: "v1.5b",
        subtitle: "Три decoy · облегчённое matched-motion поле",
        summary:
          "Ориентированная на читаемость версия v1.5 с тремя decoy, 6 200 точками, более крупными фигурами и меньшей долей постоянно движущегося фона. Траектории подбираются так, чтобы не сближаться первые восемь секунд.",
        architecture:
          "Human-tuned приватная сцена · разделённые matched-кластеры · только VP8/WebM · серверная проверка",
        metrics: [
          ["Кадр", "640×360 · 48 fps"],
          ["Кластеры", "1 цель + 3 decoy"],
          ["Сигнал", "6 200 точек · 74–82+ px"],
          ["Медиа", "≈ 1.12 МБ/с · рендер 1.04 с"],
          ["Атаки", "33.3–54.2% адаптированные"],
        ],
        pros: [
          "Уменьшает число одновременных кандидатов и движение всего поля",
          "Более крупные фигуры и разделённые пути упрощают зрительный поиск",
          "Цель, decoy, траектории и проверка остаются на сервере",
        ],
        cons: [
          "Меньше кандидатов повышает шанс solver угадать кластер",
          "Более крупные чистые фигуры могут помочь shape-template атаке",
          "Комфорт человека всё равно нужно проверять напрямую",
        ],
      },
    },
    matrixValues: {
      canvas: ["Высокое", "Да", "Минимальный", "Нет", "Непрерывное", "Низкий"],
      apng: ["Сниженное", "Нет", "≈ 0.42 МБ один раз", "Один пик", "Цикл 3 с", "Средний"],
      webm: ["Высокое", "Нет", "≈ 0.4 МБ/с", "Постоянные", "Непрерывное", "Высокий"],
      sparse: ["Высокое", "Нет", "≈ 1.41 МБ один раз", "Один пик", "Цикл 4 с", "Лучший сейчас"],
      blur: ["Смягчённое", "Нет", "≈ 1.41 МБ один раз", "Один пик", "Цикл 4 с", "Лучший сейчас"],
      webm14: ["Высокое", "Нет", "≈ 1.20 МБ/с", "≈ 1.23 с/сегмент", "Без цикла", "CV: 100%"],
      webm15: ["Высокое / насыщенное", "Нет", "≈ 1.17 МБ/с", "≈ 1.04 с/сегмент", "Без цикла", "CV: 58.3% лучший"],
      webm15b: ["Высокое / спокойнее", "Нет", "≈ 1.12 МБ/с", "≈ 1.03 с/сегмент", "Без цикла", "CV: 54.2% лучший"],
    },
  },
} as const;

const VERSION_IDS: VersionId[] = [
  "canvas",
  "apng",
  "webm",
  "sparse",
  "blur",
  "webm14",
  "webm15",
  "webm15b",
];

export function CaptchaVersions() {
  const { locale } = useLanguage();
  const copy = COPY[locale];
  const config = useCaptchaConfig();
  const [activeVersion, setActiveVersion] = useState<VersionId | null>(null);
  const [relaunchKey, setRelaunchKey] = useState(0);
  const [blurPx, setBlurPx] = useState(1.2);
  const rowLabels = Object.values(copy.rows);
  const openVersion = (id: VersionId) => {
    setRelaunchKey((current) => current + 1);
    setActiveVersion(id);
  };

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
          const benchmark = copy.benchmarks[id];
          const current = id === "sparse";
          return (
            <article className={`version-card version-${id}`} key={id}>
              <div className="version-card-head">
                <span>{version.version}</span>
                <span className={current ? "current" : ""}>
                  {current
                    ? copy.current
                    : id === "blur" ||
                        id === "webm14" ||
                        id === "webm15" ||
                        id === "webm15b"
                      ? copy.experiment
                      : copy.archived}
                </span>
              </div>
              <div className="version-card-body">
                <span className="version-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h2>{version.name}</h2>
                <p>{version.subtitle}</p>
              </div>
              <div
                className={`version-card-benchmark benchmark-${benchmark.tone}`}
                aria-label={`${copy.attackTest}: ${benchmark.score}. ${benchmark.detail}`}
              >
                <span>{copy.attackTest}</span>
                <strong>{benchmark.score}</strong>
                <small>{benchmark.detail}</small>
              </div>
              <button
                type="button"
                className="version-open"
                onClick={() => openVersion(id)}
              >
                <span>{copy.launch}</span>
                <span>→</span>
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
                  <th
                    key={id}
                    className={id === "sparse" ? "matrix-current" : undefined}
                  >
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
                    <td
                      key={id}
                      className={id === "sparse" ? "matrix-current" : undefined}
                    >
                      {copy.matrixValues[id][rowIndex]}
                    </td>
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
              <div className="version-modal-actions">
                <button
                  type="button"
                  className="version-relaunch"
                  onClick={() => setRelaunchKey((current) => current + 1)}
                >
                  <span aria-hidden="true">↻</span>
                  <span>{copy.relaunch}</span>
                </button>
                <button
                  type="button"
                  className="version-modal-close"
                  onClick={() => setActiveVersion(null)}
                  aria-label={copy.close}
                >
                  ×
                </button>
              </div>
            </div>
            <div className="version-modal-content">
              <section className="version-detail">
                <p className="eyebrow">{copy.details}</p>
                <p className="version-detail-subtitle">
                  {copy.versions[activeVersion].subtitle}
                </p>
                <p className="version-detail-summary">
                  {copy.versions[activeVersion].summary}
                </p>
                <div className="version-detail-architecture">
                  <small>{copy.architecture}</small>
                  <strong>
                    {copy.versions[activeVersion].architecture}
                  </strong>
                </div>
                <dl className="version-detail-metrics">
                  {copy.versions[activeVersion].metrics.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="version-detail-lists">
                  <div>
                    <h3>
                      <span>+</span> {copy.pros}
                    </h3>
                    <ul>
                      {copy.versions[activeVersion].pros.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="negative">
                      <span>−</span> {copy.cons}
                    </h3>
                    <ul>
                      {copy.versions[activeVersion].cons.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <p className="version-detail-verdict">
                  {copy.verdict[activeVersion]}
                </p>
              </section>

              <section className="version-live">
                <div className="version-live-heading">
                  <span className="privacy-dot" />
                  {copy.live}
                </div>
                {activeVersion === "blur" && (
                  <label className="version-blur-control">
                    <span>
                      <strong>{copy.blurControl}</strong>
                      <output>{blurPx.toFixed(1)} px</output>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="4"
                      step="0.1"
                      value={blurPx}
                      style={
                        {
                          "--progress": `${(blurPx / 4) * 100}%`,
                        } as CSSProperties
                      }
                      onChange={(event) =>
                        setBlurPx(Number(event.currentTarget.value))
                      }
                      aria-label={copy.blurControl}
                    />
                    <small>{copy.blurHint}</small>
                  </label>
                )}
                <div className="version-live-captcha">
                  {activeVersion === "canvas" ? (
                    <MotionCaptcha
                      key={relaunchKey}
                      config={config}
                      locale={locale}
                      onPass={() => undefined}
                      onClose={() => setActiveVersion(null)}
                    />
                  ) : activeVersion === "apng" ? (
                    <LegacyApngCaptcha
                      key={relaunchKey}
                      locale={locale}
                      onClose={() => setActiveVersion(null)}
                    />
                  ) : activeVersion === "webm" ? (
                    <ServerMotionCaptcha
                      key={relaunchKey}
                      locale={locale}
                      onPass={() => undefined}
                      onClose={() => setActiveVersion(null)}
                    />
                  ) : activeVersion === "sparse" ? (
                    <SparseFramesCaptcha
                      key={relaunchKey}
                      locale={locale}
                      onClose={() => setActiveVersion(null)}
                    />
                  ) : activeVersion === "blur" ? (
                    <div
                      className="version-browser-blur"
                      style={
                        {
                          "--version-blur": `${blurPx}px`,
                        } as CSSProperties
                      }
                    >
                      <SparseFramesCaptcha
                        key={relaunchKey}
                        locale={locale}
                        onClose={() => setActiveVersion(null)}
                      />
                    </div>
                  ) : activeVersion === "webm14" ? (
                    <ServerMotionCaptcha
                      key={relaunchKey}
                      locale={locale}
                      endpointBase="/api/versions/webm-v14/challenge"
                      webmOnly
                      onPass={() => undefined}
                      onClose={() => setActiveVersion(null)}
                    />
                  ) : activeVersion === "webm15" ? (
                    <ServerMotionCaptcha
                      key={relaunchKey}
                      locale={locale}
                      endpointBase="/api/versions/webm-v15/challenge"
                      webmOnly
                      matchedMotion
                      onPass={() => undefined}
                      onClose={() => setActiveVersion(null)}
                    />
                  ) : (
                    <ServerMotionCaptcha
                      key={relaunchKey}
                      locale={locale}
                      endpointBase="/api/versions/webm-v15b/challenge"
                      webmOnly
                      humanTuned
                      onPass={() => undefined}
                      onClose={() => setActiveVersion(null)}
                    />
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
