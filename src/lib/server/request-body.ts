export const MAX_JSON_BODY_BYTES = 64 * 1024;

export class RequestBodyError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "RequestBodyError";
    this.status = status;
  }
}

export async function readBoundedJson(
  request: Request,
  maximumBytes = MAX_JSON_BODY_BYTES,
): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new RequestBodyError("Request body must use application/json.", 415);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new RequestBodyError("Request body is too large.", 413);
  }

  if (!request.body) {
    throw new RequestBodyError("Request body must contain valid JSON.");
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maximumBytes) {
        await reader.cancel();
        throw new RequestBodyError("Request body is too large.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new RequestBodyError("Request body must contain valid JSON.");
  }
}
