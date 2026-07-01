const allowedTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "audio/mpeg",
  "audio/wav",
  "image/jpeg",
  "image/png",
]);

const allowedExtensions = new Set([".pdf", ".docx", ".mp3", ".wav", ".jpg", ".jpeg", ".png"]);
const maxUploadBytes = 15 * 1024 * 1024;

export function validatePracticeFile(file: Pick<File, "name" | "size" | "type">) {
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";

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

export function storagePath(teamId: string, category: string, objectId: string, filename: string) {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `${teamId}/${category}/${objectId}/${safeFilename}`;
}
