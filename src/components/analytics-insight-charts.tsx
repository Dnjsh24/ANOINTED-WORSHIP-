import { Activity, CalendarCheck2 } from "lucide-react";
import type { AnalyticsData } from "@/lib/domain/analytics";
import styles from "./analytics-dashboard.module.css";

export function AnalyticsInsightCharts({ availability, activity }: Pick<AnalyticsData, "availability" | "activity">) {
  const summary = availability.status === "ready" ? availability.data.current : null;
  const categories = activity.status === "ready"
    ? [...new Set(activity.data.map((entry) => entry.category))].map((category) => ({
        label: category.replaceAll("_", " "),
        count: activity.data.filter((entry) => entry.category === category).length,
      })).sort((a, b) => b.count - a.count)
    : [];
  const total = categories.reduce((sum, category) => sum + category.count, 0);

  return (
    <div className={styles.insightGrid}>
      <section className={styles.panel} aria-labelledby="response-snapshot-heading">
        <header className={styles.panelHeader}>
          <div className={styles.panelHeading}>
            <span className={styles.panelEyebrow}><CalendarCheck2 aria-hidden="true" /> Serving together</span>
            <h2 id="response-snapshot-heading">Availability snapshot</h2>
            <p>Recorded responses in your selected period.</p>
          </div>
        </header>
        {availability.status === "unavailable" ? <p className={styles.sourceError} role="status">{availability.message}</p> : (
          <div className={styles.readinessSnapshot}>
            <div className={styles.readinessRing} role="img" aria-label={summary?.rate == null ? "Availability snapshot: no recorded responses" : `Availability snapshot: ${Math.round(summary.rate)}% available, ${summary.available} of ${summary.total} recorded responses`}>
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle className={styles.ringTrack} cx="60" cy="60" r="50" />
                {summary?.rate != null && <circle className={styles.ringFill} cx="60" cy="60" r="50" pathLength="100" strokeDasharray={`${summary.rate} 100`} />}
              </svg>
              <div><strong>{summary?.rate == null ? "—" : `${Math.round(summary.rate)}%`}</strong><span>Available</span></div>
            </div>
            <div className={styles.responseDetails}>
              <p><i aria-hidden="true" /><strong>{summary?.available ?? 0}</strong> marked available</p>
              <p><i aria-hidden="true" /><strong>{(summary?.total ?? 0) - (summary?.available ?? 0)}</strong> other responses</p>
              <span>{summary?.total ? `${summary.total} responses across ${summary.eventCount} past events` : "No recorded responses in this period."}</span>
            </div>
          </div>
        )}
      </section>
      <section className={styles.panel} aria-labelledby="activity-breakdown-heading">
        <header className={styles.panelHeader}>
          <div className={styles.panelHeading}>
            <span className={styles.panelEyebrow}><Activity aria-hidden="true" /> Ministry momentum</span>
            <h2 id="activity-breakdown-heading">Activity breakdown</h2>
            <p>By area, across all recent activity entries in this period.</p>
          </div>
          {activity.status === "ready" && <span className={styles.chartBadge}>{total} entries</span>}
        </header>
        {activity.status === "unavailable" ? <p className={styles.sourceError} role="status">{activity.message}</p> : total === 0 ? (
          <p className={styles.emptyState}>No recent activity in this date range.</p>
        ) : (
          <ul className={styles.activityBreakdown} aria-label="Recent activity breakdown by area">
            {categories.map((category) => (
              <li key={category.label}>
                <span>{category.label}</span><strong>{category.count}</strong>
                <div aria-hidden="true"><span style={{ width: `${category.count / total * 100}%` }} /></div>
                <small>{Math.round(category.count / total * 100)}% of recent entries</small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
