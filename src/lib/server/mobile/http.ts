import "server-only";
import { ZodError } from "zod";
import { RequestBodyError } from "@/lib/server/request-body";
import { safeErrorDetails } from "@/lib/server/safe-error";
import { MobileApiError } from "./context";

export function mobileCorsHeaders(request: Request) {
  const headers = new Headers({ "Cache-Control": "private, no-store, max-age=0", Vary: "Origin", "X-Content-Type-Options": "nosniff" });
  const origin = request.headers.get("origin");
  if (!origin) return headers;
  const allowed = new Set(["capacitor://localhost", "http://localhost", "https://localhost"]);
  const configuredSite = process.env.NEXT_PUBLIC_SITE_URL;
  if (configuredSite) {
    try { allowed.add(new URL(configuredSite).origin); } catch { /* Invalid deployment config grants no origin. */ }
  }
  if (!allowed.has(origin)) throw new MobileApiError(403, "origin", "This origin cannot access mobile services.");
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Mobile-User-Id, X-Mobile-Team-Id, X-Mobile-Member-Id");
  headers.set("Access-Control-Max-Age", "600");
  return headers;
}

export function mobilePreflight(request: Request) {
  return mobileRoute(request, async () => new Response(null, { status: 204 }));
}

export async function mobileRoute(request: Request, action: () => Promise<Response>) {
  let headers = new Headers({ "Cache-Control": "private, no-store, max-age=0", Vary: "Origin" });
  try {
    headers = mobileCorsHeaders(request);
    const response = await action();
    headers.forEach((value, key) => response.headers.set(key, value));
    return response;
  } catch (error) {
    if (error instanceof MobileApiError) return Response.json({ version: 1, error: { code: error.code, message: error.message } }, { status: error.status, headers });
    if (error instanceof RequestBodyError) return Response.json({ version: 1, error: { code: "body", message: error.message } }, { status: error.status, headers });
    if (error instanceof ZodError) return Response.json({ version: 1, error: { code: "validation", message: "Invalid mobile request or response." } }, { status: 400, headers });
    console.error("Mobile API failed", safeErrorDetails(error));
    return Response.json({ version: 1, error: { code: "unavailable", message: "Sync is unavailable. Your device draft is safe." } }, { status: 503, headers });
  }
}

export function mobileDatabaseError(code: string | undefined) {
  if (code === "42501") return { code: "permission", message: "This record or action is unavailable. Retain your draft." };
  if (code === "22023" || code === "22P02" || code === "23505" || code === "23503" || code === "23514") return { code: "validation", message: "The change could not be accepted. Retain your draft and reload the record." };
  if (code === "40001" || code === "40P01") return { code: "retry", message: "Another edit is in progress. Retry with the same command ID." };
  return { code: "unavailable", message: "Sync is unavailable. Retain your draft and retry later." };
}
