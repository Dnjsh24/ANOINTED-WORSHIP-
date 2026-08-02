import { getDesktopDatabase, nowIso } from "@/lib/desktop/db";
import { isAllowedLyricShortcut } from "@/lib/presentation/lyric-shortcuts";

export type StoredLyricShortcut = {
  setlistSongId: string;
  slideId: string;
  keyCode: string;
};

type StoredLyricShortcutRow = {
  setlist_song_id: string;
  slide_id: string;
  key_code: string;
};

export function listDesktopLyricShortcuts(teamId: string, setlistId: string): StoredLyricShortcut[] {
  return getDesktopDatabase().prepare(`
    SELECT setlist_song_id, slide_id, key_code
    FROM desktop_remote_lyric_shortcuts
    WHERE team_id = ? AND setlist_id = ?
  `).all(teamId, setlistId).map((row) => {
    const shortcut = row as StoredLyricShortcutRow;
    return {
      setlistSongId: shortcut.setlist_song_id,
      slideId: shortcut.slide_id,
      keyCode: shortcut.key_code,
    };
  });
}

export function setDesktopLyricShortcut(input: {
  teamId: string;
  setlistId: string;
  setlistSongId: string;
  slideId: string;
  keyCode?: string;
}) {
  const { teamId, setlistId, setlistSongId, slideId, keyCode } = input;
  if (!teamId || !setlistId || !setlistSongId || !slideId || setlistSongId.length > 160 || slideId.length > 320) {
    throw new Error("The lyric shortcut target is invalid.");
  }
  if (keyCode === undefined) {
    getDesktopDatabase().prepare(`
      DELETE FROM desktop_remote_lyric_shortcuts
      WHERE team_id = ? AND setlist_id = ? AND setlist_song_id = ? AND slide_id = ?
    `).run(teamId, setlistId, setlistSongId, slideId);
    return;
  }
  if (!isAllowedLyricShortcut(keyCode)) throw new Error("Choose a number or letter key.");
  const db = getDesktopDatabase();
  db.prepare(`
    DELETE FROM desktop_remote_lyric_shortcuts
    WHERE team_id = ? AND setlist_id = ? AND setlist_song_id = ? AND key_code = ? AND slide_id <> ?
  `).run(teamId, setlistId, setlistSongId, keyCode, slideId);
  db.prepare(`
    INSERT INTO desktop_remote_lyric_shortcuts
      (team_id, setlist_id, setlist_song_id, slide_id, key_code, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(team_id, setlist_id, setlist_song_id, slide_id)
    DO UPDATE SET key_code = excluded.key_code, updated_at = excluded.updated_at
  `).run(teamId, setlistId, setlistSongId, slideId, keyCode, nowIso());
}
