import { timingSafeEqual } from "node:crypto";

export function hasValidCronAuthorization(request: Request, secret = process.env.CRON_SECRET) {
  if (!secret) return false;

  const provided = request.headers.get("authorization");
  if (!provided) return false;

  const expectedBuffer = Buffer.from(`Bearer ${secret}`);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}
