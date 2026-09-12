import type { ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import styles from "../app/page.module.css";
import type { ActivityEvent } from "../lib/overview";

const TYPE_ICONS: Record<string, ReactNode> = {
  invoice_created: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  ),
  payment_received: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12h8M12 8l4 4-4 4" />
    </svg>
  ),
  invoice_sent: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12l16-8-6 16-3-7-7-3z" />
    </svg>
  ),
  customer_created: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  invoice_overdue: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  ),
};

function ActivityIcon({ type }: { type: string }) {
  if (type in TYPE_ICONS)
    return <span className={styles.activityIcon}>{TYPE_ICONS[type]}</span>;
  return (
    <span className={styles.activityIcon}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
      </svg>
    </span>
  );
}

interface ActivityFeedProps {
  activity: ActivityEvent[];
}

export default function ActivityFeed({ activity }: ActivityFeedProps) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>Recent activity</h2>
          <p>Live events from your workspace</p>
        </div>
      </div>
      {activity.length ? (
        <div className={styles.activityFeed}>
          {activity.map((e) => {
            let date: Date | null = null;
            try {
              date = new Date(e.createdAt);
              if (Number.isNaN(date.getTime())) date = null;
            } catch {
              date = null;
            }
            return (
              <div className={styles.activityItem} key={e.id}>
                <ActivityIcon type={e.type} />
                <span>{e.text}</span>
                {date && (
                  <time className={styles.activityTime} dateTime={e.createdAt}>
                    {formatDistanceToNow(date, { addSuffix: true })}
                  </time>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.empty}>
          <b>No activity yet</b>
          <p>Invoice and payment events will appear here.</p>
        </div>
      )}
    </section>
  );
}