import { AlertTriangle, CheckCircle2, History, UserX } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/card";
import { LocalTime } from "@/components/local-time";
import { SetlistSongOrder, type OrderedSetlistSong } from "@/components/setlist-song-order";
import type { AssignmentConflict, MissingSetlistRole } from "@/lib/domain/setlist-readiness";
import type { SetlistChangeLog } from "@/lib/types";

export type SetlistWorkspaceSong = OrderedSetlistSong & { youtubeUrl: string | null };

export function SetlistWorkspace({
  setlistId,
  songs,
  notes,
  canManageSetlist,
  linkedToEvent,
  teamAssignments,
  assignmentConflicts,
  missingRoles,
  versionHistory,
}: {
  setlistId: string;
  songs: SetlistWorkspaceSong[];
  notes?: string | null;
  canManageSetlist: boolean;
  linkedToEvent: boolean;
  teamAssignments: Array<[string, string, string]>;
  assignmentConflicts: AssignmentConflict[];
  missingRoles: MissingSetlistRole[];
  versionHistory: SetlistChangeLog[];
}) {
  const practiceSongs = songs.filter(hasYoutubeUrl);

  return (
    <section className="mt-8 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        {notes ? (
          <Panel>
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">Setlist Notes</p>
            <p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-zinc-300">{notes}</p>
          </Panel>
        ) : null}

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold">Song Order</h2>
              <p className="mt-1 text-sm font-semibold text-zinc-500">Arrange the service flow, keys, and song notes.</p>
            </div>
            {canManageSetlist ? (
              <ButtonLink href={`/setlists/${setlistId}/add-song`} variant="ghost" className="hover:text-violet-200">+ Add Song</ButtonLink>
            ) : null}
          </div>
          <div className="mt-4">
            <SetlistSongOrder setlistId={setlistId} initialSongs={songs} canManageSetlist={canManageSetlist} />
          </div>
        </div>
      </div>

      <aside className="min-w-0 space-y-6">
        {linkedToEvent ? (
          <>
            <Panel className={assignmentConflicts.length > 0 ? "border-amber-400/30 bg-amber-500/10" : "card-hover h-fit"}>
              <div className="flex items-center gap-3">
                {assignmentConflicts.length > 0 ? <AlertTriangle className="size-5 text-amber-300" /> : <CheckCircle2 className="size-5 text-emerald-300" />}
                <h2 className="text-lg font-bold">Conflict Detection</h2>
              </div>
              {assignmentConflicts.length === 0 ? (
                <p className="mt-3 text-sm font-semibold text-zinc-400">No overlapping member assignments found.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {assignmentConflicts.map((conflict) => (
                    <div key={`${conflict.memberId}-${conflict.eventName}-${conflict.conflictingRole}`} className="rounded-lg border border-amber-300/20 bg-black/20 p-3">
                      <p className="text-sm font-bold text-amber-100">{conflict.memberName}</p>
                      <p className="mt-1 text-xs font-semibold text-amber-100/80">Also assigned as {conflict.conflictingRole} for {conflict.eventName} at {conflict.eventTime}.</p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel className="card-hover h-fit">
              <h2 className="text-xl font-bold text-violet-100">Team</h2>
              {teamAssignments.length === 0 ? (
                <p className="mt-4 text-sm font-semibold text-zinc-400">No members assigned to this event yet.</p>
              ) : teamAssignments.map(([group, name, initials]) => (
                <div key={`${group}-${name}`} className="mt-4 border-b border-white/10 pb-3 last:border-b-0">
                  <p className="font-mono text-[10px] font-bold uppercase text-zinc-500">{group}</p>
                  <div className="mt-2 flex items-center gap-3">
                    <Avatar name={initials} className="size-8" />
                    <span className="text-sm font-bold text-zinc-100">{name}</span>
                  </div>
                </div>
              ))}
            </Panel>

            <Panel className="card-hover h-fit">
              <div className="flex items-center gap-3">
                <UserX className="size-5 text-violet-200" />
                <h2 className="text-lg font-bold">Who&apos;s Missing?</h2>
              </div>
              {missingRoles.length === 0 ? (
                <p className="mt-3 text-sm font-semibold text-emerald-300">Core roles are covered.</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {missingRoles.map((role) => (
                    <div key={`${role.group}-${role.label}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                      <div>
                        <p className="font-mono text-[10px] font-bold uppercase text-zinc-500">{role.group}</p>
                        <p className="text-sm font-bold text-zinc-100">{role.label}</p>
                      </div>
                      <Badge>{role.assigned}/{role.required}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </>
        ) : null}

        {practiceSongs.length > 0 ? (
          <Panel className="card-hover h-fit">
            <h2 className="text-lg font-bold">Practice Tools</h2>
            <div className="mt-4 space-y-4">
              {practiceSongs.map((item) => (
                <div key={item.id}>
                  <p className="mb-2 text-sm font-bold text-zinc-300">{item.order}. {item.song.title}</p>
                  <div className="relative aspect-video overflow-hidden rounded-lg">
                    <iframe
                      src={`https://www.youtube.com/embed/${extractYoutubeId(item.youtubeUrl)}`}
                      title={`Practice video for ${item.song.title}`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="absolute inset-0 size-full"
                    />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        <Panel className="card-hover h-fit">
          <div className="flex items-center gap-3">
            <History className="size-5 text-violet-200" />
            <h2 className="text-lg font-bold">Version History</h2>
          </div>
          {versionHistory.length === 0 ? (
            <p className="mt-3 text-sm font-semibold text-zinc-400">Changes will appear after this setlist is saved.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {versionHistory.map((log) => (
                <div key={log.id} className="border-l border-violet-400/40 pl-3">
                  <p className="text-sm font-bold text-zinc-100">{log.summary}</p>
                  <p className="mt-1 text-xs font-semibold text-zinc-500">{log.changedBy ?? "Team member"} - <LocalTime dateIso={log.createdAt} /></p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </aside>
    </section>
  );
}

function hasYoutubeUrl(song: SetlistWorkspaceSong): song is SetlistWorkspaceSong & { youtubeUrl: string } {
  return typeof song.youtubeUrl === "string" && song.youtubeUrl.length > 0;
}

function extractYoutubeId(url: string) {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : "";
}
