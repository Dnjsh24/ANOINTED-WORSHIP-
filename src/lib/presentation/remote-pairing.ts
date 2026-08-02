/** A QR Remote session must stop accepting commands once its server expiry passes. */
export function isRemotePairingActive(expiresAt: string | undefined, now = Date.now()) {
  if (!expiresAt) return true;
  const expires = Date.parse(expiresAt);
  return Number.isFinite(expires) && expires > now;
}

export function resolveRemoteChannelTarget(input: {
  setlistId: string | undefined;
  cloudTopic: string | null;
  cloudPrivate?: boolean;
  expiresAt: string | null;
  now?: number;
}) {
  const useCloudTopic = Boolean(
    input.cloudTopic
      && isRemotePairingActive(input.expiresAt || undefined, input.now),
  );

  return useCloudTopic
    ? {
        topic: input.cloudTopic!,
        options: input.cloudPrivate ? { config: { private: true as const } } : undefined,
      }
    : {
        topic: `worship-remote:${input.setlistId}`,
        options: { config: { private: true as const } },
      };
}

/** A pairing creator may only expose a setlist from the currently selected team. */
export function assertRemotePairingSetlistTeam(selectedTeamId: string, setlistTeamId: string | null | undefined) {
  if (!setlistTeamId || setlistTeamId !== selectedTeamId) {
    throw new Error("The selected setlist does not belong to the selected team.");
  }
}

const REMOTE_SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REMOTE_QR_TOKEN_PATTERN = /^[a-z0-9_-]{32,128}$/i;

export function normalizeRemotePairingPin(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function formatRemotePairingPin(value: string) {
  const normalized = normalizeRemotePairingPin(value);
  return normalized.length > 3
    ? `${normalized.slice(0, 3)} ${normalized.slice(3)}`
    : normalized;
}

export function parseCloudPairingToken(value: string) {
  const separatorIndex = value.indexOf(".");
  if (separatorIndex <= 0) return null;
  const sessionId = value.slice(0, separatorIndex);
  const token = value.slice(separatorIndex + 1);
  if (!REMOTE_SESSION_ID_PATTERN.test(sessionId) || !REMOTE_QR_TOKEN_PATTERN.test(token)) return null;
  return { sessionId, token };
}

export function parseWorshipRemoteQrPayload(value: string, expectedOrigin: string) {
  try {
    const url = new URL(value);
    if (url.origin !== new URL(expectedOrigin).origin) return null;

    let pair: string | null = null;
    if (url.pathname === "/worship-remote" || url.pathname === "/worship-remote/") {
      pair = new URLSearchParams(url.hash.slice(1)).get("pair");
    } else if (/^\/setlists\/[^/]+\/remote\/?$/.test(url.pathname)) {
      pair = url.searchParams.get("pair");
    }

    return pair && parseCloudPairingToken(pair) ? pair : null;
  } catch {
    return null;
  }
}

/** Null means the current desktop route may render Presenter in place. */
export function getPresenterDestination(desktopMode: boolean, setlistId?: string) {
  if (!desktopMode) return "/worship-remote";
  return setlistId ? `/presenter?setlist=${encodeURIComponent(setlistId)}` : null;
}
