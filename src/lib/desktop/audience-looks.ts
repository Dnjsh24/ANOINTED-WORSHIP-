export type AudienceLookLayout = {
  showLyrics: boolean;
  showSceneLayers: boolean;
  showProps: boolean;
  lyricStyle: "full" | "lower-third" | "hidden";
};

export function defaultAudienceLookLayout(name: string): AudienceLookLayout {
  switch (name.trim().toLowerCase()) {
    case "stream lower third":
      return { showLyrics: true, showSceneLayers: true, showProps: true, lyricStyle: "lower-third" };
    case "lobby":
      return { showLyrics: true, showSceneLayers: true, showProps: false, lyricStyle: "full" };
    case "confidence":
      return { showLyrics: true, showSceneLayers: false, showProps: false, lyricStyle: "full" };
    default:
      return { showLyrics: true, showSceneLayers: true, showProps: true, lyricStyle: "full" };
  }
}

export function normalizeAudienceLookLayout(value: unknown, fallback: AudienceLookLayout = defaultAudienceLookLayout("Main Projection")): AudienceLookLayout {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const lyricStyle = source.lyricStyle === "lower-third" || source.lyricStyle === "hidden" || source.lyricStyle === "full" ? source.lyricStyle : fallback.lyricStyle;
  return {
    showLyrics: typeof source.showLyrics === "boolean" ? source.showLyrics : fallback.showLyrics,
    showSceneLayers: typeof source.showSceneLayers === "boolean" ? source.showSceneLayers : fallback.showSceneLayers,
    showProps: typeof source.showProps === "boolean" ? source.showProps : fallback.showProps,
    lyricStyle,
  };
}

/**
 * Logical output windows are opened by Electron, not a Server Action.  Keep
 * the small, validated layout in the local URL rather than exposing a file
 * path or relying on a cloud lookup.  This is deliberately limited to the
 * four primitive settings above.
 */
export function encodeAudienceLookLayout(value: AudienceLookLayout): string {
  const normalized = normalizeAudienceLookLayout(value);
  return btoa(JSON.stringify(normalized)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeAudienceLookLayout(encoded: string | null | undefined, lookName: string): AudienceLookLayout {
  const fallback = defaultAudienceLookLayout(lookName);
  if (!encoded || encoded.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(encoded)) return fallback;
  try {
    const padding = "=".repeat((4 - (encoded.length % 4)) % 4);
    const json = atob(encoded.replace(/-/g, "+").replace(/_/g, "/") + padding);
    return normalizeAudienceLookLayout(JSON.parse(json), fallback);
  } catch {
    return fallback;
  }
}
