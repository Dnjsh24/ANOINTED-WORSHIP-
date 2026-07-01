import type { SetlistSong } from "@/lib/types";

export function sortSetlistSongs(songs: SetlistSong[]) {
  return [...songs].sort((left, right) => left.order - right.order);
}

export function moveSetlistSong(songs: SetlistSong[], songId: string, direction: "up" | "down") {
  const sorted = sortSetlistSongs(songs);
  const index = sorted.findIndex((song) => song.id === songId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;

  if (index < 0 || swapIndex < 0 || swapIndex >= sorted.length) {
    return sorted;
  }

  const next = [...sorted];
  const current = next[index];
  const target = next[swapIndex];

  next[index] = { ...target, order: current.order };
  next[swapIndex] = { ...current, order: target.order };

  return sortSetlistSongs(next);
}
