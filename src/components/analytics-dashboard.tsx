"use client";

import {
  ChartNoAxesCombined,
  CalendarDays,
  Footprints,
  ListMusic,
  Megaphone,
  MessagesSquare,
  Music2,
  UserRoundPlus,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  addAnalyticsDays,
  ANALYTICS_MIN_DATE,
  buildAvailabilityTrend,
  type ActivityItem,
  type AnalyticsData,
  type AvailabilityTrendPoint,
  type ChannelVolume,
  type SongUsage,
} from "@/lib/domain/analytics";
import { AnalyticsInsightCharts } from "./analytics-insight-charts";
import styles from "./analytics-dashboard.module.css";

type TrendInterval = "daily" | "weekly";
type SongLimit = "5" | "10" | "all";

const inventoryIcons: Record<string, LucideIcon> = {
  songs: Music2,
  setlists: ListMusic,
  events: CalendarDays,
  members: UsersRound,
  channels: MessagesSquare,
  announcements: Megaphone,
  dance: Footprints,
  requests: UserRoundPlus,
};

export function AnalyticsDashboard({ analytics }: { analytics: AnalyticsData }) {
  const [songLimit, setSongLimit] = useState<SongLimit>("5");
  const [trendInterval, setTrendInterval] = useState<TrendInterval>("weekly");
  const [selectedChannel, setSelectedChannel] = useState("all");
  const [selectedArea, setSelectedArea] = useState("all");
  const currentSongs = analytics.songs.status === "ready"
    ? analytics.songs.data.filter((song) => song.count > 0)
    : [];
  const currentTopSong = currentSongs[0];
  const currentAvailability = analytics.availability.status === "ready"
    ? analytics.availability.data.current
    : null;
  const currentMessageCount = analytics.messages.status === "ready"
    ? analytics.messages.data.reduce((total, channel) => total + channel.count, 0)
    : null;
  const rangeLabel = `${formatDate(analytics.range.start)} – ${formatDate(analytics.range.end)}`;

  return (
    <div className={styles.dashboard}>
      <header className={styles.pageHeader}>
        <div className={styles.titleBlock}>
          <span className={styles.eyebrow}><ChartNoAxesCombined aria-hidden="true" /> Ministry overview</span>
          <h1>Analytics</h1>
          <p>Your ministry, in perspective. Explore how your team serves and stays connected.</p>
          {analytics.mode === "demo" && (
            <span className={styles.demoTag}>Demo data</span>
          )}
        </div>
        <DateRangeControls range={analytics.range} />
      </header>

      {analytics.range.notice && (
        <p className={styles.notice} role="status">{analytics.range.notice}</p>
      )}

      <section className={styles.summaryGrid} aria-label="Analytics summary">
        <MetricCard
          icon={Music2}
          label="Top rotation"
          value={analytics.songs.status === "unavailable"
            ? "Unavailable"
            : currentTopSong ? formatCount(currentTopSong.count) : "—"}
          detail={analytics.songs.status === "unavailable"
            ? analytics.songs.message
            : currentTopSong
              ? `${currentTopSong.title} · setlist appearances`
              : "No setlist appearances in this range"}
          valueLabel={currentTopSong ? `${currentTopSong.count} setlist appearances` : undefined}
        />
        <MetricCard
          icon={UsersRound}
          label="Confirmed availability"
          value={analytics.availability.status === "unavailable"
            ? "Unavailable"
            : formatRate(currentAvailability?.rate ?? null)}
          detail={analytics.availability.status === "unavailable"
            ? analytics.availability.message
            : currentAvailability
              ? `${formatCount(currentAvailability.available)} of ${formatCount(currentAvailability.total)} recorded responses`
              : "No responses in this range"}
          valueLabel={currentAvailability?.rate === null || !currentAvailability
            ? undefined
            : `${Math.round(currentAvailability.rate)} percent of recorded responses marked available`}
        />
        <MetricCard
          icon={MessagesSquare}
          label="Channel activity"
          value={currentMessageCount === null ? "Unavailable" : formatCount(currentMessageCount)}
          detail={analytics.messages.status === "unavailable"
            ? analytics.messages.message
            : "Delivered messages in channels you can access"}
          valueLabel={currentMessageCount === null ? undefined : `${currentMessageCount} delivered messages`}
        />
      </section>

      <div className={styles.primaryCharts}>
        <SongUsagePanel songs={analytics.songs} limit={songLimit} onLimitChange={setSongLimit} />
        <AvailabilityPanel
          source={analytics.availability}
          range={analytics.range}
          interval={analytics.range.days < 7 ? "daily" : trendInterval}
          onIntervalChange={setTrendInterval}
        />
      </div>

      <AnalyticsInsightCharts availability={analytics.availability} activity={analytics.activity} />

      <ActivityPanel
        activity={analytics.activity}
        selectedArea={selectedArea}
        onAreaChange={setSelectedArea}
      />

      <MessageVolumePanel
        channels={analytics.messages}
        selectedChannel={selectedChannel}
        onChannelChange={setSelectedChannel}
        rangeLabel={rangeLabel}
        previousRangeLabel={`${formatDate(analytics.range.previousStart)} – ${formatDate(analytics.range.previousEnd)}`}
      />

      <EventAvailabilityPanel source={analytics.availability} />
      <WebsiteTotals totals={analytics.totals} />
    </div>
  );
}

function DateRangeControls({ range }: { range: AnalyticsData["range"] }) {
  return (
    <div className={styles.dateControls}>
      <form action="/analytics" className={styles.dateForm} method="get">
        <label>
          <span>From</span>
          <input
            autoComplete="off"
            max={range.today}
            min={ANALYTICS_MIN_DATE}
            name="start"
            required
            type="date"
            defaultValue={range.start}
          />
        </label>
        <label>
          <span>To</span>
          <input
            autoComplete="off"
            max={range.today}
            min={ANALYTICS_MIN_DATE}
            name="end"
            required
            type="date"
            defaultValue={range.end}
          />
        </label>
        <button className={styles.applyButton} type="submit">Apply</button>
      </form>
      <nav className={styles.quickRanges} aria-label="Quick date ranges">
        {[7, 30, 90].map((days) => {
          const start = addAnalyticsDays(range.today, 1 - days);
          const isSelected = range.start === start && range.end === range.today;
          return (
            <Link
              key={days}
              aria-current={isSelected ? "date" : undefined}
              className={styles.quickRange}
              href={`/analytics?start=${start}&end=${range.today}`}
            >
              {days} days
            </Link>
          );
        })}
        <span className={styles.timeZone}>GMT+8</span>
      </nav>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  valueLabel,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  valueLabel?: string;
}) {
  return (
    <article className={styles.metricCard}>
      <div className={styles.metricHeading}>
        <Icon aria-hidden="true" className={styles.metricIcon} />
        <h2>{label}</h2>
      </div>
      <p aria-label={valueLabel} className={styles.metricValue}>{value}</p>
      <p className={styles.metricDetail}>{detail}</p>
    </article>
  );
}

function SongUsagePanel({
  songs,
  limit,
  onLimitChange,
}: {
  songs: AnalyticsData["songs"];
  limit: SongLimit;
  onLimitChange: (limit: SongLimit) => void;
}) {
  const visibleSongs = songs.status === "ready"
    ? songs.data.filter((song) => song.count > 0).slice(0, limit === "all" ? undefined : Number(limit))
    : [];
  const maxCount = Math.max(...visibleSongs.map((song) => song.count), 1);

  return (
    <section className={styles.panel} aria-labelledby="song-usage-heading">
      <PanelHeader
        title="Song Usage"
        description="Setlist appearances in the selected date range."
        control={(
          <label className={styles.inlineControl}>
            <span className={styles.visuallyHidden}>Songs shown</span>
            <select aria-label="Songs shown" value={limit} onChange={(event) => {
              if (isSongLimit(event.target.value)) onLimitChange(event.target.value);
            }}>
              <option value="5">Top 5 Songs</option>
              <option value="10">Top 10 Songs</option>
              <option value="all">All Songs</option>
            </select>
          </label>
        )}
        headingId="song-usage-heading"
      />
      {songs.status === "unavailable" ? (
        <SourceError message={songs.message} />
      ) : visibleSongs.length > 0 ? (
        <>
        <div aria-label="Song usage bar chart" className={styles.barChartScroller} role="region" tabIndex={0}>
            <div
              aria-hidden="true"
              className={styles.barChart}
              style={{ gridTemplateColumns: `repeat(${visibleSongs.length}, minmax(42px, 1fr))` }}
            >
              {visibleSongs.map((song, index) => (
                <div className={styles.barColumn} key={song.id}>
                  <span className={styles.barValue}>{formatCount(song.count)}</span>
                  <div className={styles.barTrack}>
                    <div
                      className={styles.barFill}
                      style={{
                        height: `${Math.max((song.count / maxCount) * 100, 4)}%`,
                        animationDelay: `${Math.min(index * 24, 240)}ms`,
                      }}
                    />
                  </div>
                  <span className={styles.barLabel} title={song.title}>{song.title}</span>
                </div>
              ))}
            </div>
          </div>
          <DataTableDisclosure label="Song usage data">
            <table>
              <caption>Setlist appearances in each period</caption>
              <thead>
                <tr><th scope="col">Song</th><th scope="col">Selected range</th><th scope="col">Previous range</th></tr>
              </thead>
              <tbody>
                {visibleSongs.map((song) => <SongUsageRow key={song.id} song={song} />)}
              </tbody>
            </table>
          </DataTableDisclosure>
        </>
      ) : (
        <EmptyState message="No setlist appearances in this date range." />
      )}
    </section>
  );
}

function SongUsageRow({ song }: { song: SongUsage }) {
  return (
    <tr>
      <th scope="row">{song.title}</th>
      <td>{formatCount(song.count)}</td>
      <td>{formatCount(song.previousCount)}</td>
    </tr>
  );
}

function AvailabilityPanel({
  source,
  range,
  interval,
  onIntervalChange,
}: {
  source: AnalyticsData["availability"];
  range: AnalyticsData["range"];
  interval: TrendInterval;
  onIntervalChange: (interval: TrendInterval) => void;
}) {
  const trend = useMemo(
    () => source.status === "ready" ? buildAvailabilityTrend(source.data, range, interval) : [],
    [interval, range, source],
  );
  const currentSummary = source.status === "ready" ? source.data.current : null;
  const previousSummary = source.status === "ready" ? source.data.previous : null;
  const hasRecordedResponses = trend.some((point) => point.currentRate !== null || point.previousRate !== null);

  return (
    <section className={styles.panel} aria-labelledby="availability-trend-heading">
      <PanelHeader
        title="Attendance Trend"
        description="Confirmed availability from recorded team responses."
        headingId="availability-trend-heading"
        control={(
          <label className={styles.inlineControl}>
            <span className={styles.visuallyHidden}>Trend interval</span>
            <select aria-label="Trend interval" value={interval} onChange={(event) => {
              if (isTrendInterval(event.target.value)) onIntervalChange(event.target.value);
            }}>
              <option disabled={range.days < 7} value="weekly">Weekly</option>
              <option value="daily">Daily</option>
            </select>
          </label>
        )}
      />
      {source.status === "unavailable" ? (
        <SourceError message={source.message} />
      ) : (
        <>
          <div className={styles.trendLegend}>
            <span><i aria-hidden="true" className={styles.currentLegend} />This period ({formatDate(range.start)} – {formatDate(range.end)})</span>
            <span><i aria-hidden="true" className={styles.previousLegend} />Previous period ({formatDate(range.previousStart)} – {formatDate(range.previousEnd)})</span>
          </div>
          <p className={styles.trendSummary}>
            This period: {formatRate(currentSummary?.rate ?? null)} from {formatCount(currentSummary?.available ?? 0)} of {formatCount(currentSummary?.total ?? 0)} responses.
            {" "}Previous: {formatRate(previousSummary?.rate ?? null)} from {formatCount(previousSummary?.available ?? 0)} of {formatCount(previousSummary?.total ?? 0)} responses.
          </p>
          {hasRecordedResponses ? (
            <TrendChart points={trend} />
          ) : (
            <EmptyState message="No availability responses in either period." />
          )}
          <p className={styles.chartNote}>
            Pending replies remain in the response count. This is availability, not a physical attendance check-in. Events dated today are omitted.
          </p>
          <DataTableDisclosure label="Attendance trend data">
            <table>
              <caption>Confirmed availability by {interval === "weekly" ? "week" : "day"}</caption>
              <thead>
                <tr><th scope="col">Date</th><th scope="col">Previous date</th><th scope="col">This period</th><th scope="col">Previous period</th></tr>
              </thead>
              <tbody>
                {trend.map((point) => (
                  <tr key={point.currentDate}>
                    <th scope="row">{point.label}</th>
                    <td>{formatDate(point.previousDate)}</td>
                    <td>{formatTrendCell(point.currentRate, point.currentTotal)}</td>
                    <td>{formatTrendCell(point.previousRate, point.previousTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableDisclosure>
        </>
      )}
    </section>
  );
}

function TrendChart({ points }: { points: AvailabilityTrendPoint[] }) {
  const tickValues = [100, 75, 50, 25, 0];
  const labels = chartLabelIndexes(points.length);

  return (
    <div className={styles.lineChartScroller}>
      <div aria-label="Availability trend line chart. Exact values are available in the data table." className={styles.lineChartFrame} role="img">
        <svg aria-hidden="true" className={styles.lineChart} viewBox="0 0 640 250" preserveAspectRatio="none">
        {tickValues.map((tick) => {
          const y = chartY(tick);
          return (
            <g key={tick}>
              <line className={styles.gridLine} x1="48" x2="628" y1={y} y2={y} />
              <text className={styles.axisLabel} textAnchor="end" x="40" y={y + 4}>{tick}%</text>
            </g>
          );
        })}
        {buildLineSegments(points, "previousRate").map((path, index) => (
          <path className={styles.previousLine} d={path} key={`previous-${index}`} />
        ))}
        {buildLineSegments(points, "currentRate").map((path, index) => (
          <path className={styles.currentLine} d={path} key={`current-${index}`} pathLength="1" />
        ))}
        {points.map((point, index) => (
          <g key={point.currentDate}>
            {point.previousRate !== null && <circle className={styles.previousPoint} cx={chartX(index, points.length)} cy={chartY(point.previousRate)} r="4" />}
            {point.currentRate !== null && <circle className={styles.currentPoint} cx={chartX(index, points.length)} cy={chartY(point.currentRate)} r="4" />}
          </g>
        ))}
        {labels.map((index) => (
          <text className={styles.axisLabel} key={points[index]?.currentDate} textAnchor={labelAnchor(index, points.length)} x={chartX(index, points.length)} y="238">
            {points[index]?.label}
          </text>
        ))}
        </svg>
      </div>
    </div>
  );
}

function ActivityPanel({
  activity,
  selectedArea,
  onAreaChange,
}: {
  activity: AnalyticsData["activity"];
  selectedArea: string;
  onAreaChange: (area: string) => void;
}) {
  const areas = activity.status === "ready"
    ? [...new Set(activity.data.map((entry) => entry.category))].sort((a, b) => a.localeCompare(b))
    : [];
  const visibleActivity = activity.status === "ready"
    ? activity.data.filter((entry) => selectedArea === "all" || entry.category === selectedArea)
    : [];

  return (
    <section className={styles.panel} aria-labelledby="team-activity-heading">
      <PanelHeader
        title="Team Activity"
        description="Recent changes in your team during the selected range."
        headingId="team-activity-heading"
        control={(
          <label className={styles.inlineControl}>
            <span className={styles.visuallyHidden}>Filter team activity by area</span>
            <select aria-label="Filter team activity by area" value={selectedArea} onChange={(event) => onAreaChange(event.target.value)}>
              <option value="all">All Areas</option>
              {areas.map((area) => <option key={area} value={area}>{toTitleCase(area)}</option>)}
            </select>
          </label>
        )}
      />
      {activity.status === "unavailable" ? (
        <SourceError message={activity.message} />
      ) : visibleActivity.length > 0 ? (
        <div aria-label="Recent team activity" className={styles.tableScroller} role="region" tabIndex={0}>
          <table className={styles.activityTable}>
            <thead>
              <tr><th scope="col">Date</th><th scope="col">Area</th><th scope="col">Activity</th><th scope="col">By</th></tr>
            </thead>
            <tbody>
              {visibleActivity.map((entry) => <ActivityRow entry={entry} key={entry.id} />)}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState message={selectedArea === "all" ? "No team activity recorded in this date range." : "No activity in this area during the selected range."} />
      )}
      {activity.status === "ready" && activity.data.length === 50 && (
        <p className={styles.tableNote}>Showing the 50 most recent activity entries.</p>
      )}
    </section>
  );
}

function ActivityRow({ entry }: { entry: ActivityItem }) {
  return (
    <tr>
      <td className={styles.dateCell}>{formatDateTime(entry.createdAt)}</td>
      <td><span className={styles.areaLabel}>{toTitleCase(entry.category)}</span></td>
      <td className={styles.activityDescription}>{entry.description}</td>
      <td className={styles.actorCell}>{entry.actor}</td>
    </tr>
  );
}

function MessageVolumePanel({
  channels,
  selectedChannel,
  onChannelChange,
  rangeLabel,
  previousRangeLabel,
}: {
  channels: AnalyticsData["messages"];
  selectedChannel: string;
  onChannelChange: (channelId: string) => void;
  rangeLabel: string;
  previousRangeLabel: string;
}) {
  const channelChoices = channels.status === "ready" ? channels.data : [];
  const visibleChannels = channelChoices.filter((channel) =>
    (selectedChannel === "all" || channel.id === selectedChannel) && (channel.count > 0 || channel.previousCount > 0),
  );
  const maximum = Math.max(...visibleChannels.flatMap((channel) => [channel.count, channel.previousCount]), 1);

  return (
    <section className={styles.panel} aria-labelledby="channel-volume-heading">
      <PanelHeader
        title="Channel Activity"
        description="Delivered messages in channels you can access."
        headingId="channel-volume-heading"
        control={(
          <label className={styles.inlineControl}>
            <span className={styles.visuallyHidden}>Filter message volume by channel</span>
            <select aria-label="Filter message volume by channel" value={selectedChannel} onChange={(event) => onChannelChange(event.target.value)}>
              <option value="all">All Channels</option>
              {channelChoices.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
            </select>
          </label>
        )}
      />
      {channels.status === "unavailable" ? (
        <SourceError message={channels.message} />
      ) : visibleChannels.length > 0 ? (
        <>
          <div className={styles.channelLegend}>
            <span><i aria-hidden="true" className={styles.currentLegend} />{rangeLabel}</span>
            <span><i aria-hidden="true" className={styles.previousLegend} />{previousRangeLabel}</span>
          </div>
          <ul aria-label="Message volume by channel" className={styles.channelList}>
            {visibleChannels.map((channel) => (
              <li className={styles.channelRow} key={channel.id}>
                <span className={styles.channelName}>{channel.name}</span>
                <div className={styles.channelBars}>
                  <ChannelBar label="Selected range" value={channel.count} max={maximum} previous={false} />
                  <ChannelBar label="Previous range" value={channel.previousCount} max={maximum} previous />
                </div>
              </li>
            ))}
          </ul>
          <DataTableDisclosure label="Channel activity data">
            <table>
              <caption>Delivered messages by channel and period</caption>
              <thead><tr><th scope="col">Channel</th><th scope="col">Selected range</th><th scope="col">Previous range</th></tr></thead>
              <tbody>
                {visibleChannels.map((channel) => <ChannelVolumeRow channel={channel} key={channel.id} />)}
              </tbody>
            </table>
          </DataTableDisclosure>
        </>
      ) : (
        <EmptyState message={selectedChannel === "all"
          ? "No delivered messages in your channels during this date range."
          : "No delivered messages in this channel during either period."} />
      )}
    </section>
  );
}

function ChannelBar({ label, value, max, previous }: { label: string; value: number; max: number; previous: boolean }) {
  return (
    <div aria-label={`${label}: ${formatCount(value)}`} className={styles.channelBarRow}>
      <span className={styles.channelBarLabel}>{label}</span>
      <span className={styles.channelBarTrack}>
        <span
          className={previous ? styles.channelBarPrevious : styles.channelBarCurrent}
          style={{ width: `${(value / max) * 100}%` }}
        />
      </span>
      <span className={styles.channelBarValue}>{formatCount(value)}</span>
    </div>
  );
}

function ChannelVolumeRow({ channel }: { channel: ChannelVolume }) {
  return <tr><th scope="row">{channel.name}</th><td>{formatCount(channel.count)}</td><td>{formatCount(channel.previousCount)}</td></tr>;
}

function EventAvailabilityPanel({ source }: { source: AnalyticsData["availability"] }) {
  return (
    <section className={styles.panel} aria-labelledby="event-availability-heading">
      <PanelHeader
        title="Availability by Event Type"
        description="Weighted availability from recorded responses in the selected range."
        headingId="event-availability-heading"
      />
      {source.status === "unavailable" ? (
        <SourceError message={source.message} />
      ) : source.data.byEventType.length > 0 ? (
        <ul className={styles.eventTypeList}>
          {source.data.byEventType.map((eventType) => (
            <li className={styles.eventTypeRow} key={eventType.type}>
              <div className={styles.eventTypeHeading}>
                <span>{eventType.label}</span>
                <strong>{formatRate(eventType.rate)}</strong>
              </div>
              <div aria-hidden="true" className={styles.eventTypeTrack}>
                {eventType.rate !== null && <span style={{ width: `${eventType.rate}%` }} />}
              </div>
              <p>{formatCount(eventType.available)} of {formatCount(eventType.total)} responses · {formatCount(eventType.eventCount)} past events</p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState message="No past events in this date range." />
      )}
    </section>
  );
}

function WebsiteTotals({ totals }: { totals: AnalyticsData["totals"] }) {
  return (
    <section aria-labelledby="website-totals-heading" className={styles.panel}>
      <PanelHeader
        title="Website Totals"
        description="Current ministry inventory across the website."
        headingId="website-totals-heading"
      />
      <ul className={styles.totalGrid}>
        {totals.map((total) => {
          const Icon = inventoryIcons[total.id] ?? CalendarDays;
          return (
            <li key={total.id}>
              <Link className={styles.totalItem} href={total.href}>
                <Icon aria-hidden="true" className={styles.totalIcon} />
                <span className={styles.totalLabel}>{total.label}</span>
                <strong aria-label={total.value === null ? `${total.label} count unavailable` : `${formatCount(total.value)} ${total.label.toLowerCase()}`} className={styles.totalValue}>
                  {total.value === null ? "Unavailable" : formatCount(total.value)}
                </strong>
                {total.message && <span className={styles.totalMessage}>{total.message}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const panelLabels: Record<string, string> = {
  "song-usage-heading": "Repertoire",
  "availability-trend-heading": "Team readiness",
  "team-activity-heading": "Behind the scenes",
  "message-volume-heading": "Connection",
  "event-availability-heading": "Gatherings",
  "website-totals-heading": "Your workspace",
};

function PanelHeader({
  title,
  description,
  headingId,
  control,
}: {
  title: string;
  description: string;
  headingId: string;
  control?: ReactNode;
}) {
  return (
    <header className={styles.panelHeader}>
      <div className={styles.panelHeading}>
        <span className={styles.panelEyebrow}>{panelLabels[headingId] ?? "Overview"}</span>
        <h2 id={headingId}>{title}</h2>
        <p>{description}</p>
      </div>
      {control}
    </header>
  );
}

function DataTableDisclosure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className={styles.dataDisclosure}>
      <summary>{label}</summary>
      <div className={styles.dataTableScroller} role="region" aria-label={label} tabIndex={0}>{children}</div>
    </details>
  );
}

function SourceError({ message }: { message: string }) {
  return <p className={styles.sourceError} role="status">{message}</p>;
}

function EmptyState({ message }: { message: string }) {
  return <p className={styles.emptyState}>{message}</p>;
}

function chartLabelIndexes(length: number) {
  if (length <= 4) return Array.from({ length }, (_, index) => index);
  return [...new Set([0, Math.round((length - 1) / 2), length - 1])];
}

function isSongLimit(value: string): value is SongLimit {
  return value === "5" || value === "10" || value === "all";
}

function isTrendInterval(value: string): value is TrendInterval {
  return value === "daily" || value === "weekly";
}

function buildLineSegments(points: AvailabilityTrendPoint[], key: "currentRate" | "previousRate") {
  const segments: string[] = [];
  let segment: string[] = [];
  points.forEach((point, index) => {
    const value = point[key];
    if (value === null) {
      if (segment.length > 0) segments.push(segment.join(" "));
      segment = [];
      return;
    }
    const command = segment.length === 0 ? "M" : "L";
    segment.push(`${command} ${chartX(index, points.length)} ${chartY(value)}`);
  });
  if (segment.length > 0) segments.push(segment.join(" "));
  return segments;
}

function chartX(index: number, length: number) {
  return length <= 1 ? 338 : 52 + (index / (length - 1)) * 566;
}

function chartY(value: number) {
  return 18 + ((100 - value) / 100) * 170;
}

function labelAnchor(index: number, length: number) {
  if (index === 0) return "start";
  if (index === length - 1) return "end";
  return "middle";
}

function formatRate(rate: number | null) {
  return rate === null ? "—" : `${Math.round(rate)}%`;
}

function formatTrendCell(rate: number | null, total: number) {
  return rate === null ? "No responses" : `${formatRate(rate)} · ${formatCount(total)} responses`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00+08:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function toTitleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
