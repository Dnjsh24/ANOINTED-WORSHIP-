import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const ALLOWED_IMPORT_HOSTS = new Set([
  "worshipchords.com",
  "www.worshipchords.com",
  "ultimate-guitar.com",
  "www.ultimate-guitar.com",
  "tabs.ultimate-guitar.com",
]);
const MAX_REDIRECTS = 3;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

function isPrivateIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19));
}

export function isPrivateNetworkAddress(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  const version = isIP(normalized);
  if (version === 4) return isPrivateIpv4(normalized);
  if (version !== 6) return true;
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") ||
    normalized.startsWith("fd") || normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") || normalized.startsWith("fea") ||
    normalized.startsWith("feb") || normalized.startsWith("ff") ||
    normalized.startsWith("::ffff:127.") || normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.");
}

export function parseAllowedImportUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) throw new Error("Enter a valid supported URL.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid supported URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("Only standard HTTPS provider URLs are supported.");
  }
  if (!ALLOWED_IMPORT_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("This chord provider is not supported.");
  }
  return url;
}

async function assertPublicDns(url: URL) {
  const results = await lookup(url.hostname, { all: true, verbatim: true });
  if (!results.length || results.some(({ address }) => isPrivateNetworkAddress(address))) {
    throw new Error("The provider resolved to a private network address.");
  }
}

async function readLimitedBody(response: Response) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_IMPORT_BYTES) throw new Error("The provider response is too large.");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMPORT_BYTES) {
      await reader.cancel();
      throw new Error("The provider response is too large.");
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

export async function fetchAllowedRemoteHtml(value: unknown, fetcher: typeof fetch = fetch) {
  let url = parseAllowedImportUrl(value);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertPublicDns(url);
    const response = await fetcher(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
      headers: {
        "User-Agent": "AnointedWorship/1.0 (+https://anointed-worship-app.vercel.app)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === MAX_REDIRECTS) throw new Error("The provider redirected too many times.");
      url = parseAllowedImportUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`The provider returned HTTP ${response.status}.`);
    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new Error("The provider did not return an HTML page.");
    }
    return { url, html: await readLimitedBody(response) };
  }
  throw new Error("The provider redirected too many times.");
}
