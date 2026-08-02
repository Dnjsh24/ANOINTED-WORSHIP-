const TOKEN_RESPONSE_LIMIT = 64 * 1024;
const SEARCH_RESPONSE_LIMIT = 512 * 1024;
const PROVIDER_TIMEOUT_MS = 8_000;

let tokenCache: { token: string; expiresAt: number } | null = null;

export function resetSpotifyTokenCacheForTests() {
  tokenCache = null;
}

export function parseSpotifySearchQuery(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Spotify search query is required.");
  }
  const query = value.trim();
  if (query.length > 120) {
    throw new Error("Spotify search query is too long.");
  }
  return query;
}

async function readJsonResponse(response: Response, maximumBytes: number) {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maximumBytes) {
    throw new Error("Spotify response is too large.");
  }
  if (!response.body) {
    throw new Error("Spotify response was invalid.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel();
        throw new Error("Spotify response is too large.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Spotify response was invalid.");
  }
}

async function fetchWithTimeout(
  fetcher: typeof fetch,
  input: string,
  init: RequestInit,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function getSpotifyAccessToken(
  clientId: string,
  clientSecret: string,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
) {
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token;
  }

  const response = await fetchWithTimeout(
    fetcher,
    "https://accounts.spotify.com/api/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    },
  );
  if (!response.ok) {
    throw new Error(`Spotify token request failed with HTTP ${response.status}.`);
  }

  const payload = await readJsonResponse(response, TOKEN_RESPONSE_LIMIT);
  const token =
    payload && typeof payload === "object" && "access_token" in payload
      ? (payload as { access_token?: unknown }).access_token
      : undefined;
  const expiresIn =
    payload && typeof payload === "object" && "expires_in" in payload
      ? Number((payload as { expires_in?: unknown }).expires_in)
      : 3_600;
  if (typeof token !== "string" || !token || !Number.isFinite(expiresIn)) {
    throw new Error("Spotify token response was invalid.");
  }

  tokenCache = {
    token,
    expiresAt: now + Math.max(60, expiresIn) * 1_000,
  };
  return token;
}

export async function searchSpotifyTracks(
  query: string,
  accessToken: string,
  fetcher: typeof fetch = fetch,
) {
  const response = await fetchWithTimeout(
    fetcher,
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=5`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    throw new Error(`Spotify search request failed with HTTP ${response.status}.`);
  }
  const payload = await readJsonResponse(response, SEARCH_RESPONSE_LIMIT);
  if (
    !payload ||
    typeof payload !== "object" ||
    !("tracks" in payload) ||
    !payload.tracks ||
    typeof payload.tracks !== "object" ||
    !("items" in payload.tracks) ||
    !Array.isArray(payload.tracks.items)
  ) {
    throw new Error("Spotify search response was invalid.");
  }
  return payload.tracks.items;
}
