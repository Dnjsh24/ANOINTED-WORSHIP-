"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, CloudOff, Database, Download, History, RefreshCw } from "lucide-react";
import { getDesktopSyncDetailsAction, syncDesktopWorkspaceAction } from "@/app/actions";

type SyncDetails = NonNullable<Awaited<ReturnType<typeof getDesktopSyncDetailsAction>>>;

function formatDate(value: string | null) {
  if (!value) return "Not yet completed";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString();
}

function describeChange(change: SyncDetails["recentChanges"][number]) {
  const action = change.command.replace(".", " ");
  const subject = change.title ?? `${change.entityType} ${change.entityId.slice(0, 8)}`;
  return `${action}: ${subject}`;
}

export function DesktopSyncDashboard({ initialDetails }: { initialDetails: SyncDetails }) {
  const [details, setDetails] = useState(initialDetails);
  const [message, setMessage] = useState("Sync this PC whenever you want to check for cloud updates.");
  const [isPending, startTransition] = useTransition();

  const refresh = async () => {
    const next = await getDesktopSyncDetailsAction();
    if (next) setDetails(next);
  };

  const sync = () => startTransition(async () => {
    setMessage("Synchronizing your local workspace…");
    const result = await syncDesktopWorkspaceAction();
    setMessage(result.message);
    await refresh();
  });

  const isReady = Boolean(details.lastSyncAt) && details.pending === 0 && details.conflicts === 0 && details.mediaPending === 0 && details.bibleTranslations >= 3;
  const StatusIcon = isReady ? CheckCircle2 : details.conflicts > 0 ? AlertTriangle : CloudOff;
  const statusLabel = isReady ? "Offline ready" : details.conflicts > 0 ? "Needs attention" : "Sync incomplete";

  const storedContent = [
    { label: "Songs & chords", value: details.content.songs.toLocaleString(), detail: "lyrics and chord charts" },
    { label: "Setlists", value: details.content.setlists.toLocaleString(), detail: `${details.content.setlistSongs.toLocaleString()} setlist songs` },
    { label: "Presenter notes", value: details.content.annotations.toLocaleString(), detail: "stage annotations" },
    { label: "Offline Bible", value: details.content.bibleVerses.toLocaleString(), detail: `${details.bibleTranslations}/3 translations installed` },
    { label: "Presentation media", value: `${details.content.mediaDownloaded}/${details.content.mediaTotal}`, detail: details.mediaPending ? `${details.mediaPending} file${details.mediaPending === 1 ? "" : "s"} incomplete` : "all known files available" },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/15 via-[#15121f] to-[#111014] p-5 shadow-xl shadow-black/20 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 flex size-10 items-center justify-center rounded-xl ${isReady ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
              <StatusIcon className="size-5" />
            </span>
            <div>
              <p className="text-lg font-bold text-white">{statusLabel}</p>
              <p className="mt-1 text-sm text-zinc-400">Last successful sync: <span className="font-semibold text-zinc-200">{formatDate(details.lastSyncAt)}</span></p>
              <p className="mt-1 text-xs text-zinc-500">{message}</p>
            </div>
          </div>
          <button type="button" onClick={sync} disabled={isPending} className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60">
            <RefreshCw className={isPending ? "size-4 animate-spin" : "size-4"} />
            {isPending ? "Syncing…" : "Sync now"}
          </button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatusCard label="Queued changes" value={details.pending} detail={details.pending ? "Saved locally; waiting to upload." : "Nothing waiting to upload."} tone={details.pending ? "amber" : "emerald"} />
        <StatusCard label="Conflicts" value={details.conflicts} detail={details.conflicts ? "Choose how to keep each version." : "No conflicting edits."} tone={details.conflicts ? "amber" : "emerald"} />
        <StatusCard label="Media downloads" value={details.mediaPending} detail={details.mediaPending ? "Offline media is not complete." : "All known media is available."} tone={details.mediaPending ? "amber" : "emerald"} />
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#111014] p-5">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-violet-300" />
          <h2 className="font-bold text-white">Content stored on this PC</h2>
        </div>
        <p className="mt-1 text-sm text-zinc-500">These are the worship items currently available from the local offline workspace.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {storedContent.map((item) => (
            <div key={item.label} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
              <p className="text-xs font-semibold text-zinc-400">{item.label}</p>
              <p className="mt-2 text-2xl font-extrabold text-white">{item.value}</p>
              <p className="mt-1 text-[11px] text-zinc-500">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-[#111014] p-5">
          <div className="flex items-center gap-2">
            <History className="size-4 text-violet-300" />
            <h2 className="font-bold text-white">Recent sync activity</h2>
          </div>
          <div className="mt-4 space-y-2">
            {details.lastSyncAt && <ActivityRow title="Cloud workspace downloaded" detail="Last successful sync" time={details.lastSyncAt} status="applied" />}
            {details.recentChanges.map((change) => <ActivityRow key={`${change.entityId}-${change.updatedAt}`} title={describeChange(change)} detail={change.status === "pending" ? "Waiting to upload" : change.status === "conflict" ? "Needs resolution" : "Synced"} time={change.updatedAt} status={change.status} />)}
            {!details.lastSyncAt && details.recentChanges.length === 0 && <EmptyActivity />}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#111014] p-5">
          <div className="flex items-center gap-2">
            <Download className="size-4 text-violet-300" />
            <h2 className="font-bold text-white">What Sync now does</h2>
          </div>
          <ul className="mt-4 space-y-3 text-sm text-zinc-400">
            <li>Uploads saved song, setlist, and presenter changes.</li>
            <li>Downloads newer worship content for this team.</li>
            <li>Checks presentation media and Bible availability.</li>
            <li>Records conflicts instead of overwriting either version.</li>
          </ul>
          {details.conflicts > 0 && <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs font-semibold text-amber-200">{details.conflicts} conflict{details.conflicts === 1 ? " needs" : "s need"} attention before the workspace is fully offline ready.</p>}
        </div>
      </section>
    </div>
  );
}

function StatusCard({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: "amber" | "emerald" }) {
  return <div className="rounded-2xl border border-white/10 bg-[#111014] p-4"><p className="text-xs font-bold uppercase tracking-wider text-zinc-500">{label}</p><p className={`mt-2 text-3xl font-extrabold ${tone === "emerald" ? "text-emerald-300" : "text-amber-300"}`}>{value}</p><p className="mt-1 text-xs text-zinc-500">{detail}</p></div>;
}

function ActivityRow({ title, detail, time, status }: { title: string; detail: string; time: string; status: string }) {
  const color = status === "applied" ? "bg-emerald-400" : status === "conflict" ? "bg-amber-400" : "bg-violet-400";
  return <div className="flex gap-3 rounded-lg border border-white/[0.06] bg-white/[0.025] p-3"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${color}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-zinc-200">{title}</p><p className="mt-0.5 text-xs text-zinc-500">{detail} · {formatDate(time)}</p></div></div>;
}

function EmptyActivity() {
  return <p className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-zinc-500">No sync activity has been recorded on this PC yet.</p>;
}
