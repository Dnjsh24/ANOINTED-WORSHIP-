type SafeErrorDetails = {
  type: string;
  code?: string;
  status?: number;
};

const SAFE_IDENTIFIER = /^[A-Za-z0-9._-]{1,64}$/;

function safeIdentifier(value: unknown) {
  return typeof value === "string" && SAFE_IDENTIFIER.test(value) ? value : undefined;
}

function safeStatus(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;
}

/**
 * Returns bounded diagnostic metadata without messages, stacks, request
 * headers, response bodies, endpoints, tokens, or nested provider objects.
 */
export function safeErrorDetails(error: unknown): SafeErrorDetails {
  if (!error || typeof error !== "object") {
    return { type: "Error" };
  }

  const candidate = error as Record<string, unknown>;
  const type = safeIdentifier(candidate.name) ?? "Error";
  const code = safeIdentifier(candidate.code);
  const status = safeStatus(candidate.statusCode) ?? safeStatus(candidate.status);

  return {
    type,
    ...(code ? { code } : {}),
    ...(status ? { status } : {}),
  };
}
