import { layoutBars, layoutStackedBars } from "../lib/charts";
import type { AxisLabel } from "../lib/charts";

const VIEW_W = 560;
const VIEW_H = 170;
const AXIS_FILL = "#8a9792";
const RULE = "#e4eae7";

function AxisLabels({ labels }: { labels: AxisLabel[] }) {
  return (
    <>
      {labels.map((l, i) => (
        <text
          key={i}
          x={l.x}
          y={l.y}
          textAnchor="middle"
          fill={AXIS_FILL}
          fontSize={10}
          fontFamily="var(--font-ui, sans-serif)"
        >
          {l.text}
        </text>
      ))}
    </>
  );
}

export interface BarDatum {
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarDatum[];
  color?: string;
  formatLabel?: (v: number) => string;
  ariaLabel?: string;
}

/**
 * Single-series bar chart rendered as inline SVG with no dependencies.
 * Hover a bar to see its formatted value via the native `<title>` tooltip.
 */
export function BarChart({
  data,
  color = "var(--green-600)",
  formatLabel = (v) => String(v),
  ariaLabel = "Bar chart",
}: BarChartProps) {
  const values: Array<[string, number]> = data.map((d) => [d.label, d.value]);
  const { rects, labels } = layoutBars(values, VIEW_W, VIEW_H);

  return (
    <svg
      className="ledgerly-chart"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
    >
      {rects.map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.width}
          height={Math.max(r.height, r.value > 0 ? 2 : 1)}
          rx={4}
          fill={color}
          opacity={r.value === 0 ? 0.22 : 1}
        >
          <title>{formatLabel(r.value)}</title>
        </rect>
      ))}
      <line x1={0} y1={VIEW_H - 22} x2={VIEW_W} y2={VIEW_H - 22} stroke={RULE} strokeWidth={1} />
      <AxisLabels labels={labels} />
    </svg>
  );
}

interface StackedBarChartProps {
  data: Array<{ label: string; baseValue: number; topValue: number }>;
  baseColor?: string;
  topColor?: string;
  formatLabel?: (v: number) => string;
  ariaLabel?: string;
}

/**
 * Stacked bar chart for two series — used for outstanding (base) with overdue
 * (top) layered above it.
 */
export function StackedBarChart({
  data,
  baseColor = "var(--green-500)",
  topColor = "var(--warning)",
  formatLabel = (v) => String(v),
  ariaLabel = "Stacked bar chart",
}: StackedBarChartProps) {
  const values: Array<[string, number, number]> = data.map((d) => [
    d.label,
    d.baseValue,
    d.topValue,
  ]);
  const { base, top, labels } = layoutStackedBars(values, VIEW_W, VIEW_H);

  return (
    <svg
      className="ledgerly-chart"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
    >
      {base.map((r, i) => (
        <rect
          key={`base-${i}`}
          x={r.x}
          y={r.y}
          width={r.width}
          height={Math.max(r.height, r.value > 0 ? 2 : 1)}
          fill={baseColor}
        >
          <title>{formatLabel(r.value)}</title>
        </rect>
      ))}
      {top.map((r, i) =>
        r.height > 0 ? (
          <rect key={`top-${i}`} x={r.x} y={r.y} width={r.width} height={r.height} fill={topColor}>
            <title>{formatLabel(r.value)}</title>
          </rect>
        ) : null,
      )}
      <line x1={0} y1={VIEW_H - 22} x2={VIEW_W} y2={VIEW_H - 22} stroke={RULE} strokeWidth={1} />
      <AxisLabels labels={labels} />
    </svg>
  );
}