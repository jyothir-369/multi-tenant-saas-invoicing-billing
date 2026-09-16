"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import styles from "../page.module.css";
import { api, formatMoney } from "../../lib/api";
import {
  DEFAULT_OVERVIEW,
  OVERVIEW_RANGES,
  type OverviewRange,
  type OverviewResponse,
} from "../../lib/overview";
import { BarChart, StackedBarChart } from "../../components/BarChart";
import TrendBadge from "../../components/TrendBadge";
import ActivityFeed from "../../components/ActivityFeed";
import { monthShort } from "../../lib/charts";

function invoiceStatusTone(status: string) {
  const s = status.toUpperCase();
  if (s === "PAID")
    return { badge: `${styles.badge} ${styles.paid}`, label: "Paid" };
  if (s === "OVERDUE")
    return { badge: `${styles.badge} ${styles.overdue}`, label: "Overdue" };
  return { badge: `${styles.badge} ${styles.pending}`, label: s };
}

export default function OverviewPage() {
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
      setError(e instanceof Error ? e.message : "Unable to load dashboard data.");
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

  return (
    <div className={styles.main}>
      <div className={styles.heading}>
        <div>
          <span className={styles.kicker}>LEDGERLY WORKSPACE</span>
          <h1>
            Overview<span className={styles.dot}>.</span>
          </h1>
          <p>Your billing workspace at a glance.</p>
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
            <b>Couldn’t load your dashboard</b>
            <p>{error}</p>
            <button onClick={() => void load()}>Try again</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className={`${styles.empty} ${styles.emptyLarge}`}>
          <span>◌</span>
          Loading your billing data…
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
                <span>Collected this month</span>
                <TrendBadge value={stats.paid_this_month_delta_pct} />
              </div>
              <strong>{formatMoney(stats.paid_this_month_cents)}</strong>
              <small>
                {stats.paid_this_month_delta_pct === null
                  ? "First tracked month"
                  : "vs. previous month"}
              </small>
            </article>
            <article className={styles.kpi}>
              <div className={styles.kpiTop}>
                <span>Customers</span>
              </div>
              <strong>{stats.total_customers}</strong>
              <small>Active in your workspace</small>
            </article>
          </section>

          <div className={styles.grid}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Cash collected</h2>
                  <p>Paid invoices over the last 6 months</p>
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
                ariaLabel="Cash collected over the last 6 months"
              />
              <div className={styles.chartFooter}>
                Total collected:{" "}
                <b>{formatMoney(revBars.reduce((s, b) => s + b.value, 0))}</b>
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Invoice pipeline</h2>
                  <p>Outstanding vs. overdue by due month</p>
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
                ariaLabel="Outstanding and overdue invoices by month"
              />
              <div className={styles.chartFooter}>
                Pipeline total:{" "}
                <b>
                  {formatMoney(
                    bucketBars.reduce((s, b) => s + b.baseValue + b.topValue, 0),
                  )}
                </b>
              </div>
            </section>
          </div>

          <div className={styles.grid}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Recent invoices</h2>
                  <p>Latest billing activity</p>
                </div>
                <Link href="/dashboard/invoices">View all →</Link>
              </div>
              {overview.recent_invoices.length ? (
                <div className={styles.table}>
                  {overview.recent_invoices.map((invoice) => {
                    const tone = invoiceStatusTone(invoice.status);
                    return (
                      <div className={styles.tableRow} key={invoice.id}>
                        <span>
                          {invoice.invoiceNumber ||
                            `Invoice ${invoice.id.slice(0, 6)}`}
                          <small>{invoice.customerName || "Customer"}</small>
                        </span>
                        <span className={tone.badge}>{tone.label}</span>
                        <b>{formatMoney(invoice.amountCents)}</b>
                        <small>
                          {invoice.dueDate
                            ? new Date(invoice.dueDate).toLocaleDateString()
                            : "—"}
                        </small>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.empty}>
                  <b>No invoices yet</b>
                  <p>Invoices will appear here when your workspace has billing activity.</p>
                </div>
              )}
            </section>

            <ActivityFeed activity={overview.recent_activity} />
          </div>
        </>
      )}
    </div>
  );
}