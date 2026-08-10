import {
  BarChart3,
  CalendarCheck2,
  CalendarDays,
  Headphones,
  Lightbulb,
  MessageCircleMore,
  MessageSquareText,
  Music2,
  type LucideIcon,
} from "lucide-react";

interface AnalyticsDashboardProps {
  mostPlayedSongs: { title: string; count: number }[];
  attendanceStats: { type: string; rate: number }[];
  mostActiveChannels: { name: string; count: number }[];
}

export function AnalyticsDashboard({
  mostPlayedSongs,
  attendanceStats,
  mostActiveChannels,
}: AnalyticsDashboardProps) {
  const maxSongCount = Math.max(...mostPlayedSongs.map((song) => song.count), 1);
  const maxChannelCount = Math.max(...mostActiveChannels.map((channel) => channel.count), 1);
  const averageAttendance = Math.round(
    attendanceStats.reduce((total, stat) => total + clampPercentage(stat.rate), 0) /
      Math.max(attendanceStats.length, 1),
  );
  const messageCount = mostActiveChannels.reduce((total, channel) => total + channel.count, 0);
  const topSong = mostPlayedSongs[0];
  const strongestAttendance = [...attendanceStats].sort((a, b) => b.rate - a.rate)[0];

  return (
    <div className="mt-7 space-y-5">
      <section aria-label="Engagement summary" className="stagger grid gap-3 sm:grid-cols-3">
        <MetricCard
          icon={Music2}
          label="Top rotation"
          value={topSong?.title ?? "No data yet"}
          detail={topSong ? `${formatCount(topSong.count, "appearance")}` : "Build your first setlist"}
          accent="violet"
        />
        <MetricCard
          icon={CalendarCheck2}
          label="Average attendance"
          value={attendanceStats.length > 0 ? `${averageAttendance}%` : "—"}
          detail={formatCount(attendanceStats.length, "event type")}
          accent="emerald"
        />
        <MetricCard
          icon={MessageCircleMore}
          label="Channel activity"
          value={messageCount.toLocaleString()}
          detail={`${formatCount(mostActiveChannels.length, "channel")} · 30 days`}
          accent="sky"
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.85fr)]">
        <section className="animate-fade-up overflow-hidden rounded-2xl border border-white/10 bg-[#111014]/90">
          <PanelHeader
            icon={Headphones}
            eyebrow="Repertoire"
            title="Songs in rotation"
            description="The songs appearing most often across your setlists."
            meta={formatCount(mostPlayedSongs.length, "song")}
          />

          {mostPlayedSongs.length > 0 ? (
            <ol className="px-4 pb-4 sm:px-6 sm:pb-6">
              {mostPlayedSongs.map((song, index) => (
                <li
                  key={`${song.title}-${index}`}
                  className="group grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 border-t border-white/[0.07] py-3.5 first:border-t-0 sm:grid-cols-[2rem_minmax(9rem,0.8fr)_minmax(8rem,1fr)_auto] sm:gap-x-4"
                >
                  <span
                    className={`flex size-7 items-center justify-center rounded-full font-mono text-[10px] font-bold ${
                      index === 0
                        ? "bg-violet-500 text-white shadow-[0_0_20px_rgba(139,92,246,0.35)]"
                        : "border border-white/10 bg-white/[0.04] text-zinc-400"
                    }`}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="min-w-0 truncate text-sm font-bold text-zinc-100">
                    {song.title}
                  </p>
                  <div className="col-span-2 col-start-2 mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06] sm:col-span-1 sm:col-start-auto sm:mt-0">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-300 transition-[width] duration-500"
                      style={{ width: `${Math.max((song.count / maxSongCount) * 100, 4)}%` }}
                      aria-hidden="true"
                    />
                  </div>
                  <span className="col-start-3 row-start-1 text-right font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 sm:col-start-auto sm:row-auto">
                    {song.count}×
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState
              icon={Music2}
              title="Your rotation will appear here"
              description="Add songs to setlists to start seeing repertoire trends."
            />
          )}
        </section>

        <section
          className="animate-fade-up overflow-hidden rounded-2xl border border-white/10 bg-[#111014]/90"
          style={{ animationDelay: "80ms" }}
        >
          <PanelHeader
            icon={CalendarDays}
            eyebrow="Readiness"
            title="Attendance by gathering"
            description="Availability across each event type."
          />

          {attendanceStats.length > 0 ? (
            <div className="px-5 pb-6 sm:px-6">
              <div className="flex items-center gap-5 border-y border-white/[0.07] py-5">
                <div
                  className="grid size-28 shrink-0 place-items-center rounded-full p-2"
                  style={{
                    background: `conic-gradient(#34d399 0 ${averageAttendance}%, rgba(255,255,255,0.07) ${averageAttendance}% 100%)`,
                  }}
                  role="img"
                  aria-label={`Average attendance ${averageAttendance}%`}
                >
                  <div className="grid size-full place-items-center rounded-full border border-white/[0.07] bg-[#111014] text-center">
                    <div>
                      <p className="text-2xl font-black tracking-tight text-white">{averageAttendance}%</p>
                      <p className="font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-zinc-400">
                        Average
                      </p>
                    </div>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-300">
                    Team readiness
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-5 text-zinc-200">
                    {averageAttendance >= 85
                      ? "Your team is showing strong availability."
                      : "A little follow-up could lift team readiness."}
                  </p>
                </div>
              </div>

              <ul className="divide-y divide-white/[0.07]">
                {attendanceStats.map((stat, index) => {
                  const rate = Math.round(clampPercentage(stat.rate));
                  return (
                    <li key={`${stat.type}-${index}`} className="py-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-bold capitalize text-zinc-100">
                          {stat.type.replace(/_/g, " ")}
                        </span>
                        <span className="font-mono text-xs font-bold text-emerald-300">{rate}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-300"
                          style={{ width: `${rate}%` }}
                          aria-hidden="true"
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="No attendance signal yet"
              description="Responses will appear after the team confirms availability."
            />
          )}
        </section>
      </div>

      <section
        className="animate-fade-up overflow-hidden rounded-2xl border border-white/10 bg-[#111014]/90"
        style={{ animationDelay: "160ms" }}
      >
        <PanelHeader
          icon={MessageSquareText}
          eyebrow="Connection"
          title="Most active channels"
          description="Conversation volume from the last 30 days."
          meta={formatCount(messageCount, "message")}
        />

        {mostActiveChannels.length > 0 ? (
          <ol className="grid border-t border-white/[0.07] sm:grid-cols-2 xl:grid-cols-3">
            {mostActiveChannels.map((channel, index) => (
              <li
                key={`${channel.name}-${index}`}
                className="relative min-w-0 border-b border-white/[0.07] px-5 py-5 last:border-b-0 sm:border-r sm:last:border-r-0 xl:[&:nth-child(3n)]:border-r-0"
              >
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-sky-400/15 bg-sky-500/10 text-sky-300">
                      <MessageSquareText className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{channel.name}</p>
                      <p className="mt-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-400">
                        Rank {String(index + 1).padStart(2, "0")}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-xl font-black tracking-tight text-white">
                    {channel.count}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-600 to-sky-300"
                    style={{ width: `${Math.max((channel.count / maxChannelCount) * 100, 4)}%` }}
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-2 font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                  {formatCount(channel.count, "message")}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            icon={MessageSquareText}
            title="Quiet channels for now"
            description="Messages from the last 30 days will show up here."
          />
        )}
      </section>

      {(topSong || strongestAttendance) && (
        <aside className="animate-fade-up flex flex-col gap-3 rounded-2xl border border-violet-400/15 bg-violet-500/[0.06] p-4 sm:flex-row sm:items-center sm:px-5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-300">
            <Lightbulb className="size-4" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium leading-6 text-zinc-300">
            <span className="font-bold text-white">Quick read:</span>{" "}
            {topSong && (
              <>
                <span className="text-violet-200">{topSong.title}</span> leads your repertoire with{" "}
                {formatCount(topSong.count, "appearance")}
              </>
            )}
            {topSong && strongestAttendance ? ", while " : ""}
            {strongestAttendance && (
              <>
                <span className="capitalize text-emerald-200">
                  {strongestAttendance.type.replace(/_/g, " ")}
                </span>{" "}
                has the strongest attendance at {Math.round(clampPercentage(strongestAttendance.rate))}%
              </>
            )}
            .
          </p>
        </aside>
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  accent: "violet" | "emerald" | "sky";
}) {
  const accentClasses = {
    violet: "border-violet-400/15 bg-violet-500/10 text-violet-300",
    emerald: "border-emerald-400/15 bg-emerald-500/10 text-emerald-300",
    sky: "border-sky-400/15 bg-sky-500/10 text-sky-300",
  };

  return (
    <article className="animate-fade-up min-w-0 rounded-2xl border border-white/10 bg-[#111014]/90 p-4 sm:p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className={`grid size-10 shrink-0 place-items-center rounded-xl border ${accentClasses[accent]}`}>
          <Icon className="size-4.5" aria-hidden="true" />
        </div>
        <BarChart3 className="size-4 text-white/15" aria-hidden="true" />
      </div>
      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-400">{label}</p>
      <p className="mt-1 truncate text-xl font-black tracking-tight text-white" title={value}>
        {value}
      </p>
      <p className="mt-1 text-xs font-semibold text-zinc-400">{detail}</p>
    </article>
  );
}

function PanelHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  meta,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  meta?: string;
}) {
  return (
    <header className="flex items-start justify-between gap-4 p-5 sm:p-6">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border border-violet-400/15 bg-violet-500/10 text-violet-300">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-violet-300">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-lg font-extrabold tracking-tight text-white">{title}</h2>
          <p className="mt-1 text-xs font-medium leading-5 text-zinc-400">{description}</p>
        </div>
      </div>
      {meta && (
        <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-300">
          {meta}
        </span>
      )}
    </header>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-5 mb-5 grid min-h-44 place-items-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center sm:mx-6 sm:mb-6">
      <div>
        <Icon className="mx-auto size-5 text-violet-300" aria-hidden="true" />
        <p className="mt-3 text-sm font-bold text-zinc-100">{title}</p>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-zinc-400">{description}</p>
      </div>
    </div>
  );
}

function clampPercentage(value: number) {
  return Math.min(Math.max(value, 0), 100);
}

function formatCount(value: number, singular: string) {
  return `${value.toLocaleString()} ${singular}${value === 1 ? "" : "s"}`;
}
