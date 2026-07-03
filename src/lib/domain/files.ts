const allowedTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "audio/mpeg",
  "audio/wav",
  "image/jpeg",
  "image/png",
]);

const allowedExtensions = new Set([".pdf", ".docx", ".mp3", ".wav", ".jpg", ".jpeg", ".png"]);
const mimeTypesByExtension = new Map([
  [".pdf", "application/pdf"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
]);
const maxUploadBytes = 15 * 1024 * 1024;
const allowedAvatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedAvatarExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const avatarExtensionByMimeType = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);
const maxAvatarBytes = 5 * 1024 * 1024;

export const profileAvatarBucket = "profile-avatars";

function extensionFor(filename: string) {
  return filename.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
}

export function validatePracticeFile(file: Pick<File, "name" | "size" | "type">) {
  const extension = extensionFor(file.name);

  if (file.size > maxUploadBytes) {
    return { valid: false, reason: "Files must be 15 MB or smaller." };
  }

  if (!allowedExtensions.has(extension)) {
    return { valid: false, reason: "Unsupported file extension." };
  }

  if (file.type && !allowedTypes.has(file.type)) {
    return { valid: false, reason: "Unsupported file type." };
  }

  return { valid: true, reason: null };
}

export function inferPracticeFileMimeType(file: Pick<File, "name" | "type">) {
  return file.type || mimeTypesByExtension.get(extensionFor(file.name)) || "application/octet-stream";
}

export function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`;
  }

  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

export function isImageMimeType(mimeType?: string | null) {
  return Boolean(mimeType?.startsWith("image/"));
}

export function fileKindLabel(mimeType: string | null | undefined, filename: string) {
  if (isImageMimeType(mimeType)) {
    return "Image";
  }

  const extension = extensionFor(filename);
  if (extension) {
    return extension.slice(1).toUpperCase();
  }

  return mimeType?.split("/")[0]?.toUpperCase() || "File";
}

export function storagePath(teamId: string, category: string, objectId: string, filename: string) {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `${teamId}/${category}/${objectId}/${safeFilename}`;
}

export function validateProfileAvatar(file: Pick<File, "name" | "size" | "type">) {
  const extension = extensionFor(file.name);

  if (file.size > maxAvatarBytes) {
    return { valid: false, reason: "Profile photos must be 5 MB or smaller." };
  }

  if (!allowedAvatarExtensions.has(extension)) {
    return { valid: false, reason: "Use a JPG, PNG, or WebP image." };
  }

  if (file.type && !allowedAvatarTypes.has(file.type)) {
    return { valid: false, reason: "Use a JPG, PNG, or WebP image." };
  }

  return { valid: true, reason: null };
}

export function profileAvatarStoragePath(userId: string, objectId: string, file: Pick<File, "name" | "type">) {
  const extension = avatarExtensionByMimeType.get(file.type) || extensionFor(file.name) || ".jpg";
  return `${userId}/${objectId}${extension === ".jpeg" ? ".jpg" : extension}`;
}
