export function safeVideoUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function getYouTubeVideoId(value?: string | null): string | null {
  const safe = safeVideoUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  const parts = url.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  if (["youtu.be", "www.youtu.be"].includes(url.hostname) && parts.length === 1) id = parts[0];
  else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(url.hostname)) {
    if (parts[0] === "watch" && parts.length === 1) id = url.searchParams.get("v");
    else if (["embed", "shorts", "live", "v"].includes(parts[0]) && parts.length === 2) id = parts[1];
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}
