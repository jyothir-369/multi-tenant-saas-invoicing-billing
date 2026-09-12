import styles from "../app/page.module.css";

interface TrendBadgeProps {
  /** Percentage change, e.g. 12.5 for "+12.5%". `null` renders a neutral dash. */
  value: number | null;
  /** When true, rising is positive/up; when false, falling is positive. */
  positiveIsGood?: boolean;
  /** Text to show when there is no baseline to compare against. */
  neutralLabel?: string;
}

/**
 * Small delta pill shown inside KPI cards: `▲ +12%` in green, `▼ −8%` in red.
 */
export default function TrendBadge({
  value,
  positiveIsGood = true,
  neutralLabel = "No change",
}: TrendBadgeProps) {
  if (value === null || value === undefined) {
    return (
      <span className={`${styles.kpiTrend} ${styles.flat}`}>
        <span aria-hidden="true">–</span> {neutralLabel}
      </span>
    );
  }
  const up = value > 0;
  const risingIsGood = positiveIsGood ? up : !up;
  const tone = value === 0 ? styles.flat : risingIsGood ? styles.up : styles.down;
  const arrow = value === 0 ? "→" : up ? "▲" : "▼";
  const sign = value > 0 ? "+" : "−";

  return (
    <span
      className={`${styles.kpiTrend} ${tone}`}
      aria-label={`${up ? "up" : "down"} ${Math.abs(value)} percent`}
    >
      <span aria-hidden="true">{arrow}</span> {sign}
      {Math.abs(value)}%
    </span>
  );
}