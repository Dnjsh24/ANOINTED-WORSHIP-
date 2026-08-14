export interface OnScreenTextNote {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text: string;
  fontSize: number;
  color: string;
  isMinimized?: boolean;
  targetRoles?: string[];
}

export interface SongAnnotation {
  id?: string;
  songId: string;
  setlistId?: string | null;
  setlistSongId?: string | null;
  userId?: string | null;
  textNotes: string;
  screenNotes?: OnScreenTextNote[];
  drawingDataUrl: string;
  isShared: boolean;
  shareTargets?: string[];
  updatedAt?: string;
}

/**
 * Generates local storage and lookup keys for song annotations.
 */
export function getAnnotationStorageKey(
  songId: string,
  setlistId?: string | null,
  setlistSongId?: string | null,
  userId?: string | null,
  isShared = false,
): string {
  if (isShared && setlistId && setlistSongId) {
    return `annotation_shared_${setlistId}_${setlistSongId}`;
  }
  if (setlistId && setlistSongId) {
    return `annotation_user_${userId || "default"}_${setlistId}_${setlistSongId}`;
  }
  return `annotation_master_${userId || "default"}_${songId}`;
}

/**
 * Creates a copied annotation target payload for another setlist song.
 */
export function buildCopiedAnnotation(
  source: SongAnnotation,
  targetSetlistId: string,
  targetSetlistSongId: string,
  targetUserId?: string,
): SongAnnotation {
  return {
    ...source,
    id: undefined,
    setlistId: targetSetlistId,
    setlistSongId: targetSetlistSongId,
    userId: targetUserId ?? source.userId,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Creates a master song default annotation payload.
 */
export function buildMasterSongDefaultAnnotation(
  source: SongAnnotation,
  targetUserId?: string,
): SongAnnotation {
  return {
    ...source,
    id: undefined,
    setlistId: null,
    setlistSongId: null,
    userId: targetUserId ?? source.userId,
    updatedAt: new Date().toISOString(),
  };
}
