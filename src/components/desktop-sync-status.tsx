"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, CloudOff, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getDesktopSyncSummaryAction, syncDesktopWorkspaceAction } from "@/app/actions";

type Summary = {
  pending: number;
  conflicts: number;
  mediaPending: number;
  bibleTranslations: number;
  lastSyncAt: string | null;
} | null;

function formatSyncTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const elapsedMinutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (elapsedMinutes <= 1) return "just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes} minutes ago`;
  if (elapsedMinutes < 24 * 60) return `${Math.round(elapsedMinutes / 60)} hours ago`;
  return date.toLocaleString();
}

export function DesktopSyncStatus({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary>(null);
  const [message, setMessage] = useState("Checking local workspace status.");
  const [isPending, startTransition] = useTransition();

  const refreshSummary = async () => setSummary(await getDesktopSyncSummaryAction());

  const sync = () => startTransition(async () => {
    setMessage("Synchronizing local changes and downloaded content.");
    const result = await syncDesktopWorkspaceAction();
    setMessage(result.message);
    await refreshSummary();
    if (result.ok) router.refresh();
  });

  useEffect(() => {
    void refreshSummary();
    if (navigator.onLine) sync();
    const onOnline = () => sync();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // Initial sync intentionally runs only once; reconnects use the event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastSyncLabel = formatSyncTime(summary?.lastSyncAt ?? null);
  const status = !summary
    ? { label: "Checking sync", detail: "Reading this PC's workspace status.", color: "text-zinc-300", Icon: RefreshCw }
    : isPending
      ? { label: "Syncing", detail: "Updating this PC from the cloud.", color: "text-violet-200", Icon: RefreshCw }
      : summary.conflicts > 0
        ? { label: "Needs attention", detail: `${summary.conflicts} conflict${summary.conflicts === 1 ? "" : "s"} must be resolved before this workspace is fully ready.`, color: "text-amber-300", Icon: AlertTriangle }
        : !summary.lastSyncAt
          ? { label: "Not downloaded yet", detail: "Keep the PC online and click Sync now to prepare the workspace.", color: "text-amber-300", Icon: CloudOff }
          : summary.pending > 0
            ? { label: `${summary.pending} change${summary.pending === 1 ? "" : "s"} queued`, detail: "Your offline edits are saved on this PC and will upload when connected.", color: "text-amber-300", Icon: CloudOff }
            : summary.mediaPending > 0
              ? { label: "Media incomplete", detail: `${summary.mediaPending} presentation file${summary.mediaPending === 1 ? "" : "s"} still need${summary.mediaPending === 1 ? "s" : ""} to download.`, color: "text-amber-300", Icon: CloudOff }
              : summary.bibleTranslations < 3
                ? { label: "Bible download incomplete", detail: "KJV, WEB, and BBE must be installed before offline Bible use is ready.", color: "text-amber-300", Icon: CloudOff }
                : { label: "Offline ready", detail: `Core worship content is stored on this PC. Last synced ${lastSyncLabel ?? "recently"}.`, color: "text-emerald-300", Icon: CheckCircle2 };

  const StatusIcon = status.Icon;
  if (compact) {
    return (
      <Link
        href="/sync"
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition hover:bg-white/[0.06] ${status.color}`}
        title={`${status.detail} ${message}`}
      >
        <StatusIcon className={isPending ? "size-3.5 animate-spin" : "size-3.5"} />
        <span className="hidden lg:inline">{status.label}</span>
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-400" title={`${status.detail} ${message}`}>
      <span className={`inline-flex items-center gap-1 font-medium ${status.color}`}>
        <StatusIcon className={isPending ? "size-3 animate-spin" : "size-3"} />
        {status.label}
      </span>
      <span className="hidden max-w-72 truncate text-zinc-500 xl:inline">{status.detail}</span>
      <button type="button" onClick={sync} disabled={isPending} className="inline-flex items-center gap-1 rounded px-2 py-1 font-semibold text-violet-200 hover:bg-white/10 disabled:opacity-50">
        <RefreshCw className={isPending ? "size-3 animate-spin" : "size-3"} />
        Sync now
      </button>
    </div>
  );
}
