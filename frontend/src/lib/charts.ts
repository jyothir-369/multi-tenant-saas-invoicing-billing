/*
 * Zero-dependency geometry helpers for the lightweight inline SVG charts.
 * Given values in plot units (cents), returns pixel-space rectangles and axis
 * label positions ready to render inside a `<svg viewBox>`.
 */

export interface BarRect {
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
}

export interface AxisLabel {
  x: number;
  y: number;
  text: string;
}

/**
 * Lays out a single-series bar chart.
 *
 * @param values      [label, value][] pairs in plot units (e.g. cents).
 * @param viewWidth   svg viewBox width in px.
 * @param viewHeight  svg viewBox height in px.
 * @param padX        horizontal padding inside the plot.
 * @param topPad      space reserved above the tallest bar.
 * @param bottomPad   space reserved below bars for axis labels.
 */
export function layoutBars(
  values: Array<[string, number]>,
  viewWidth: number,
  viewHeight: number,
  padX = 8,
  topPad = 10,
  bottomPad = 22,
): { rects: BarRect[]; labels: AxisLabel[]; max: number } {
  const n = values.length;
  const max = Math.max(1, ...values.map(([, v]) => v));
  const plotW = viewWidth - padX * 2;
  const plotH = viewHeight - topPad - bottomPad;
  const slot = plotW / Math.max(n, 1);
  const barW = Math.min(38, slot * 0.52);

  const rects: BarRect[] = [];
  const labels: AxisLabel[] = [];
  values.forEach(([label, value], i) => {
    const h = (value / max) * plotH;
    const x = padX + slot * i + (slot - barW) / 2;
    const y = topPad + plotH - h;
    rects.push({ x, y, width: barW, height: h, value });
    labels.push({ x: padX + slot * i + slot / 2, y: viewHeight - 6, text: label });
  });
  return { rects, labels, max };
}

/**
 * Lays out a stacked bar chart for two series (base + top).
 * Base series renders from the plot floor; top series stacks on top of it.
 */
export function layoutStackedBars(
  values: Array<[string, number, number]>,
  viewWidth: number,
  viewHeight: number,
  padX = 8,
  topPad = 10,
  bottomPad = 22,
): {
  base: BarRect[];
  top: BarRect[];
  labels: AxisLabel[];
  max: number;
} {
  const n = values.length;
  const max = Math.max(1, ...values.map(([, b, t]) => b + t));
  const plotW = viewWidth - padX * 2;
  const plotH = viewHeight - topPad - bottomPad;
  const slot = plotW / Math.max(n, 1);
  const barW = Math.min(38, slot * 0.52);

  const base: BarRect[] = [];
  const top: BarRect[] = [];
  const labels: AxisLabel[] = [];
  values.forEach(([label, b, t], i) => {
    const x = padX + slot * i + (slot - barW) / 2;
    const bH = (b / max) * plotH;
    const tH = (t / max) * plotH;
    base.push({ x, y: topPad + plotH - bH, width: barW, height: bH, value: b });
    top.push({ x, y: topPad + plotH - bH - tH, width: barW, height: tH, value: t });
    labels.push({ x: padX + slot * i + slot / 2, y: viewHeight - 6, text: label });
  });
  return { base, top, labels, max };
}

/**
 * Formats a "YYYY-MM" month key as a short label ("Jan", "Dec").
 */
export function monthShort(key: string): string {
  const m = key.match(/^\d{4}-(\d{2})/);
  if (!m) return key;
  return new Date(0, Number(m[1]) - 1, 1).toLocaleDateString("en-US", {
    month: "short",
  });
}