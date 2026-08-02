export const MAX_SLIDE_BACKGROUND_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

type SlideBackgroundFile = Pick<File, "name" | "size" | "type">;

export function validateSlideBackgroundFile(file: SlideBackgroundFile):
  | { ok: true; extension: "jpg" | "png" | "webp" }
  | { ok: false; message: string } {
  const extension = ALLOWED_TYPES[file.type as keyof typeof ALLOWED_TYPES];
  if (!extension) {
    return { ok: false, message: "Choose a PNG, JPEG, or WebP image." };
  }
  if (file.size < 1 || file.size > MAX_SLIDE_BACKGROUND_BYTES) {
    return { ok: false, message: "Choose an image no larger than 5 MB." };
  }
  return { ok: true, extension };
}

export function buildSlideBackgroundPath(
  teamId: string,
  userId: string,
  objectId: string,
  extension: "jpg" | "png" | "webp",
) {
  return `${teamId}/${userId}/slide-backgrounds/${objectId}.${extension}`;
}
