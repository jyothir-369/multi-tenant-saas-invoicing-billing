"use client";
import { useCallback, useEffect, useState } from "react";
import styles from "../../page.module.css";
import { api, formatMoney } from "../../../lib/api";
import {
  DEFAULT_OVERVIEW,
  OVERVIEW_RANGES,
  type OverviewRange,
  type OverviewResponse,
} from "../../../lib/overview";
import { BarChart, StackedBarChart } from "../../../components/BarChart";
import TrendBadge from "../../../components/TrendBadge";
import { monthShort } from "../../../lib/charts";

export default function ReportsPage() {
  const [overview, setOverview] = useState<OverviewResponse>(DEFAULT_OVERVIEW);
  const [range, setRange] = useState<OverviewRange>("this_month");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<OverviewResponse>(
        `/dashboard/overview?range=${range}`,
      );
      setOverview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load reports data.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const { stats } = overview;
  const revBars = overview.revenue_by_month.map((m) => ({
    label: monthShort(m.month),
    value: m.amount_cents,
  }));
  const bucketBars = overview.invoice_buckets.map((m) => ({
    label: monthShort(m.month),
    baseValue: m.outstanding_cents,
    topValue: m.overdue_cents,
  }));
  const pipeline = bucketBars.reduce((s, b) => s + b.baseValue + b.topValue, 0);
  const revTotal = revBars.reduce((s, b) => s + b.value, 0);
  const revAvg = revBars.length ? revTotal / revBars.length : 0;

  return (
    <div className={styles.main}>
      <div className={styles.heading}>
        <div>
          <span className={styles.kicker}>LEDGERLY WORKSPACE</span>
          <h1>
            Reports<span className={styles.dot}>.</span>
          </h1>
          <p>Cash flow and pipeline at a glance.</p>
        </div>
        <div className={styles.rangeTabs} role="tablist" aria-label="Date range">
          {OVERVIEW_RANGES.map((r) => (
            <button
              key={r.value}
              role="tab"
              aria-selected={range === r.value}
              className={range === r.value ? styles.rangeTabActive : styles.rangeTab}
              onClick={() => setRange(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className={`${styles.alert} ${styles.alertError}`}>
          <span>!</span>
          <div>
            <b>Couldn’t load your reports</b>
            <p>{error}</p>
            <button onClick={() => void load()}>Try again</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className={`${styles.empty} ${styles.emptyLarge}`}>
          <span>◌</span>
          Building your reports…
        </div>
      ) : (
        <>
          <section className={styles.kpis}>
            <article className={styles.kpi}>
              <div className={styles.kpiTop}>
                <span>Total outstanding</span>
              </div>
              <strong>{formatMoney(stats.outstanding_cents)}</strong>
              <small>Open sent + overdue invoices</small>
            </article>
            <article className={styles.kpi}>
              <div className={styles.kpiTop}>
                <span>Overdue</span>
              </div>
              <strong>{formatMoney(stats.overdue_cents)}</strong>
              <small>Past-due by due date</small>
            </article>
            <article className={styles.kpi}>
              <div className={styles.kpiTop}>
                <span>Collected this period</span>
                <TrendBadge value={stats.paid_this_month_delta_pct} />
              </div>
              <strong>{formatMoney(stats.paid_this_month_cents)}</strong>
              <small>Paid invoices in range</small>
            </article>
            <article className={styles.kpi}>
              <div className={styles.kpiTop}>
                <span>Avg. monthly</span>
              </div>
              <strong>{formatMoney(revAvg)}</strong>
              <small>Across the last 6 months</small>
            </article>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>Cash collected</h2>
                <p>Paid invoices per month — {formatMoney(revTotal)} total</p>
              </div>
              <div className={styles.legend}>
                <span className={styles.legendItem}>
                  <span
                    className={styles.legendSwatch}
                    style={{ background: "var(--green-600)" }}
                  />
                  Collected
                </span>
              </div>
            </div>
            <BarChart
              data={revBars}
              formatLabel={(v) => formatMoney(v)}
              ariaLabel="Cash collected per month"
            />
          </section>

          <div className={styles.grid}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Outstanding vs. overdue</h2>
                  <p>Open pipeline by due month</p>
                </div>
                <div className={styles.legend}>
                  <span className={styles.legendItem}>
                    <span
                      className={styles.legendSwatch}
                      style={{ background: "var(--green-500)" }}
                    />
                    Outstanding
                  </span>
                  <span className={styles.legendItem}>
                    <span
                      className={styles.legendSwatch}
                      style={{ background: "var(--warning)" }}
                    />
                    Overdue
                  </span>
                </div>
              </div>
              <StackedBarChart
                data={bucketBars}
                formatLabel={(v) => formatMoney(v)}
                ariaLabel="Outstanding and overdue by month"
              />
              <div className={styles.chartFooter}>
                Open pipeline: <b>{formatMoney(pipeline)}</b>
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Customer base</h2>
                  <p>Active customers in your workspace</p>
                </div>
              </div>
              <div className={styles.chart}>
                <div className={styles.empty} style={{ padding: "30px 10px" }}>
                  <strong style={{ fontSize: 44, color: "var(--green-600)" }}>
                    {stats.total_customers}
                  </strong>
                  <b style={{ marginTop: 8 }}>Total customers</b>
                  <p>Archived customers are excluded.</p>
                </div>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}