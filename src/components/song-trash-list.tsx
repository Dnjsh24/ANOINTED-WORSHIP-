"use client";

import { useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import { hardDeleteSongAction, restoreSongAction } from "@/app/actions";
import type { Song } from "@/lib/types";

// Extended song type for trash
export type TrashedSong = Song & {
  deletedAt: string;
};

export function SongTrashList({ songs }: { songs: TrashedSong[] }) {
  const [pending, startTransition] = useTransition();

  if (songs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-24 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-white/5">
          <Trash2 className="size-6 text-zinc-500" />
        </div>
        <h3 className="mt-4 text-sm font-bold text-white">Trash is empty</h3>
        <p className="mt-2 max-w-sm text-xs font-medium text-zinc-500">
          Songs that you delete will appear here for 30 days before being permanently removed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {songs.map((song) => {
        const deletedDate = new Date(song.deletedAt);
        const deletionDeadline = new Date(deletedDate);
        deletionDeadline.setDate(deletionDeadline.getDate() + 30);
        
        const daysLeft = Math.max(0, Math.ceil((deletionDeadline.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)));
        const isUrgent = daysLeft <= 3;

        return (
          <div key={song.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#18171c] p-4 transition-colors hover:border-white/20">
            <div>
              <h4 className="text-sm font-bold text-white">{song.title}</h4>
              <p className="text-xs text-zinc-400">{song.artist}</p>
              
              <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold">
                <span className={isUrgent ? "text-red-400" : "text-zinc-500"}>
                  Permanently deleting in {daysLeft} {daysLeft === 1 ? 'day' : 'days'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <form action={restoreSongAction}>
                <input type="hidden" name="songId" value={song.id} />
                <button
                  type="submit"
                  disabled={pending}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                  onClick={(e) => {
                    e.preventDefault();
                    startTransition(async () => {
                      const fd = new FormData(e.currentTarget.form!);
                      await restoreSongAction(fd);
                    });
                  }}
                >
                  <RotateCcw className="size-3.5" />
                  Restore
                </button>
              </form>

              <form action={hardDeleteSongAction}>
                <input type="hidden" name="songId" value={song.id} />
                <button
                  type="submit"
                  disabled={pending}
                  className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-bold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
                  onClick={(e) => {
                    e.preventDefault();
                    if (window.confirm("Are you sure you want to permanently delete this song? This action cannot be undone.")) {
                      startTransition(async () => {
                        const fd = new FormData(e.currentTarget.form!);
                        await hardDeleteSongAction(fd);
                      });
                    }
                  }}
                >
                  <Trash2 className="size-3.5" />
                  Delete Permanently
                </button>
              </form>
            </div>
          </div>
        );
      })}
    </div>
  );
}
