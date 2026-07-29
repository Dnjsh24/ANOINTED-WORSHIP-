/** A QR Remote session must stop accepting commands once its server expiry passes. */
export function isRemotePairingActive(expiresAt: string | undefined, now = Date.now()) {
  if (!expiresAt) return true;
  const expires = Date.parse(expiresAt);
  return Number.isFinite(expires) && expires > now;
}

export function resolveRemoteChannelTarget(input: {
  setlistId: string | undefined;
  cloudTopic: string | null;
  expiresAt: string | null;
  now?: number;
}) {
  const useCloudTopic = Boolean(
    input.cloudTopic
      && isRemotePairingActive(input.expiresAt || undefined, input.now),
  );

  return useCloudTopic
    ? { topic: input.cloudTopic!, options: undefined }
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
