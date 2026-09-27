import type { CharacteristicProgress } from "@/lib/character";
import { levelProgress } from "@/lib/xp";

/**
 * Пятиугольник характеристик — чистый SVG без графических библиотек.
 *
 * Пять осей, равномерно расположенные по окружности, по часовой стрелке от
 * верхней вершины: Разум → Дисциплина → Питание → Тело → Созидание.
 * Вложенные пятиугольники — шкала роста, поверх неё — фигура текущего
 * профиля. Гравюрный стиль: тонкие бронзовые линии, сдержанное золотое
 * свечение, подписи в типографике хроники.
 */

type CharacterKey = CharacteristicProgress["key"];

/** Оси радара: порядок = геометрия (по часовой от верхней вершины). */
const AXES: readonly { key: CharacterKey; label: string }[] = [
  { key: "mind", label: "Разум" },
  { key: "nutrition", label: "Питание" },
  { key: "discipline", label: "Дисциплина" },
  { key: "body", label: "Тело" },
  { key: "creation", label: "Созидание" },
];

/** Уровней шкалы (вложенных пятиугольников). */
const GRID_RINGS = 5;
/** Минимальный радиус вершины — нулевой профиль остаётся читаемым pentagon'ом. */
const MIN_FRACTION = 0.1;

const CX = 170;
const CY = 132;
const R = 78;
const VIEW_W = 342;
const VIEW_H = 234;

function axisAngle(index: number): number {
  return ((-90 + index * 72) * Math.PI) / 180;
}

function axisPoint(index: number, radius: number): { x: number; y: number } {
  const a = axisAngle(index);
  return { x: CX + radius * Math.cos(a), y: CY + radius * Math.sin(a) };
}

function pointsToString(points: { x: number; y: number }[]): string {
  return points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}

/**
 * Нормализация: вершина = пройденные уровни + прогресс текущего уровня
 * (непрерывная, монотонная величина), отнесённая к максимуму среди пяти
 * характеристик. Одинаковые значения → одинаковый радиус, больший уровень —
 * дальше от центра; детерминировано между рендерами.
 */
function chartFractions(characteristics: CharacteristicProgress[]): number[] {
  const byKey = new Map(characteristics.map((c) => [c.key, c]));
  const scores = AXES.map(({ key }) => {
    const c = byKey.get(key);
    return c ? c.level - 1 + levelProgress(c.xp).progress : 0;
  });
  const max = Math.max(...scores);
  return scores.map((score) =>
    max > 0 ? Math.max(MIN_FRACTION, score / max) : MIN_FRACTION,
  );
}

/** Позиции подписей: сверху — над вершиной, по бокам — снаружи, снизу — под. */
const LABELS: readonly {
  x: number;
  nameY: number;
  numY: number;
  anchor: "middle" | "start" | "end";
}[] = [
  { x: CX, nameY: 28, numY: 41, anchor: "middle" },
  { x: CX + R * Math.cos(axisAngle(1)) + 8, nameY: 106, numY: 119, anchor: "start" },
  { x: CX + R * Math.cos(axisAngle(2)) + 8, nameY: 209, numY: 222, anchor: "start" },
  { x: CX + R * Math.cos(axisAngle(3)) - 8, nameY: 209, numY: 222, anchor: "end" },
  { x: CX + R * Math.cos(axisAngle(4)) - 8, nameY: 106, numY: 119, anchor: "end" },
];

export default function CharacterRadar({
  characteristics,
}: {
  characteristics: CharacteristicProgress[];
}) {
  const fractions = chartFractions(characteristics);
  const byKey = new Map(characteristics.map((c) => [c.key, c]));

  const figure = AXES.map((_, i) => axisPoint(i, R * fractions[i]));

  const rings = Array.from({ length: GRID_RINGS }, (_, k) => (k + 1) / GRID_RINGS);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="mx-auto block w-full max-w-[340px]"
      role="img"
      aria-label="Пятиугольник характеристик: уровни Тела, Разума, Созидания, Дисциплины и Питания"
    >
      {/* Шкала: вложенные пятиугольники, внешний чуть ярче */}
      {rings.map((f, k) => (
        <polygon
          key={f}
          points={pointsToString(AXES.map((_, i) => axisPoint(i, R * f)))}
          fill="none"
          stroke="var(--bronze-bright)"
          strokeOpacity={k === rings.length - 1 ? 0.3 : 0.12}
          strokeWidth={1}
        />
      ))}

      {/* Оси: тонкие лучи от центра к вершинам */}
      {AXES.map((_, i) => {
        const p = axisPoint(i, R);
        return (
          <line
            key={i}
            x1={CX}
            y1={CY}
            x2={p.x}
            y2={p.y}
            stroke="var(--bronze-bright)"
            strokeOpacity={0.16}
            strokeWidth={1}
          />
        );
      })}

      {/* Метка центра — гравированный ромб */}
      <g opacity={0.7}>
        <rect
          x={CX - 3.2}
          y={CY - 3.2}
          width={6.4}
          height={6.4}
          transform={`rotate(45 ${CX} ${CY})`}
          fill="none"
          stroke="var(--gold)"
          strokeOpacity={0.55}
          strokeWidth={1}
        />
      </g>

      {/* Фигура текущего профиля: свечение → заливка → линия → вершины */}
      <g className="radar-figure" style={{ transformOrigin: `${CX}px ${CY}px` }}>
        <polygon
          points={pointsToString(figure)}
          fill="none"
          stroke="var(--gold)"
          strokeOpacity={0.12}
          strokeWidth={5}
        />
        <polygon
          points={pointsToString(figure)}
          fill="rgba(201, 168, 106, 0.13)"
          stroke="var(--gold)"
          strokeOpacity={0.85}
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
        {figure.map((p, i) => (
          <g key={AXES[i].key}>
            <circle cx={p.x} cy={p.y} r={4.2} fill="var(--gold)" opacity={0.18} />
            <circle cx={p.x} cy={p.y} r={2} fill="var(--gold)" />
          </g>
        ))}
      </g>

      {/* Подписи: название + уровень у каждой вершины */}
      {AXES.map((axis, i) => {
        const label = LABELS[i];
        const c = byKey.get(axis.key);
        return (
          <g key={axis.key}>
            <text
              x={label.x}
              y={label.nameY}
              textAnchor={label.anchor}
              className="font-chronicle"
              fontSize={10}
              fill="var(--bronze-bright)"
              style={{ letterSpacing: "0.08em", textTransform: "uppercase" }}
            >
              {axis.label}
            </text>
            <text
              x={label.x}
              y={label.numY}
              textAnchor={label.anchor}
              className="font-chronicle"
              fontSize={11.5}
              fontWeight={700}
              fill="var(--gold)"
            >
              {c ? c.level : 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
