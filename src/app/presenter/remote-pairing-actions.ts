"use server";

import { createHash, randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/supabase/env";
import { assertRemotePairingSetlistTeam } from "@/lib/presentation/remote-pairing";

export async function createCloudRemotePairing(setlistId: string) {
  const context = await getRequiredTeamContext();
  if (!context.teamId || !context.userId) throw new Error("Sign in and choose a team before pairing a Remote.");
  const pairingCode = randomBytes(32).toString("base64url");
  const channelSecret = randomBytes(32).toString("base64url");
  const supabase = await createClient();
  const { data: setlist, error: setlistError } = await supabase
    .from("setlists")
    .select("team_id")
    .eq("id", setlistId)
    .maybeSingle();
  if (setlistError) throw new Error(setlistError.message);
  assertRemotePairingSetlistTeam(context.teamId, (setlist as { team_id?: string } | null)?.team_id);
  const { data, error } = await (supabase.from("worship_remote_pairing_sessions") as any).insert({
    team_id: context.teamId,
    setlist_id: setlistId,
    created_by: context.userId,
    pairing_code_hash: createHash("sha256").update(pairingCode).digest("hex"),
    channel_secret: channelSecret,
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
  }).select("id, expires_at").single();
  if (error || !data) throw new Error(error?.message || "Could not create the Remote pairing session.");
  const url = new URL(`/setlists/${encodeURIComponent(setlistId)}/remote`, getSiteUrl());
  url.searchParams.set("pair", `${data.id}.${pairingCode}`);
  const pairingUrl = url.toString();
  return {
    url: pairingUrl,
    qrDataUrl: await QRCode.toDataURL(pairingUrl, { margin: 1, width: 256 }),
    channelTopic: `worship-remote-session:${channelSecret}`,
    expiresAt: data.expires_at,
  };
}

export async function claimCloudRemotePairing(pair: string) {
  const [sessionId, pairingCode] = pair.split(".");
  if (!sessionId || !pairingCode || pairingCode.length < 32) throw new Error("Invalid Remote pairing code.");
  const supabase = await createClient();
  const { data, error } = await (supabase.rpc as any)("claim_worship_remote_pairing", { p_session_id: sessionId, p_pairing_code: pairingCode });
  const claimed = (data as Array<{ setlist_id: string; channel_secret: string; expires_at: string }> | null)?.[0];
  if (error || !claimed) throw new Error(error?.message || "This Remote pairing code is invalid or expired.");
  return { setlistId: claimed.setlist_id, channelTopic: `worship-remote-session:${claimed.channel_secret}`, expiresAt: claimed.expires_at };
}
