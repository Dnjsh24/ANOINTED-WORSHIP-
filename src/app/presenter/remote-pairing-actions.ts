"use server";

import QRCode from "qrcode";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/supabase/env";
import {
  normalizeRemotePairingPin,
  parseCloudPairingToken,
} from "@/lib/presentation/remote-pairing";

const uuidSchema = z.string().uuid();

type PairingRpcError = { code?: string; message?: string } | null;

export type RemotePairingConnection = {
  sessionId: string;
  setlistId: string;
  teamId: string;
  channelTopic: string;
  privateChannel: boolean;
  expiresAt: string;
};

export type RemotePairingClaimResult =
  | ({ ok: true } & RemotePairingConnection)
  | {
      ok: false;
      code: "auth_required" | "invalid" | "rate_limited" | "unavailable";
      message: string;
    };

type RemotePairingErrorCode = Extract<RemotePairingClaimResult, { ok: false }>["code"];

type PairingConnectionRow = {
  session_id?: string | null;
  setlist_id?: string | null;
  team_id?: string | null;
  channel_topic?: string | null;
  channel_secret?: string | null;
  private_channel?: boolean | null;
  expires_at?: string | null;
  error_code?: string | null;
};

function isAuthenticationError(error: PairingRpcError) {
  const message = error?.message?.toLowerCase() || "";
  return error?.code === "42501"
    || error?.code === "PGRST301"
    || message.includes("authentication")
    || message.includes("permission denied")
    || message.includes("jwt");
}

function failedClaim(error: PairingRpcError, fallbackCode: RemotePairingErrorCode = "invalid"): RemotePairingClaimResult {
  if (isAuthenticationError(error)) {
    return { ok: false, code: "auth_required", message: "Sign in to connect this Worship Remote." };
  }
  if (fallbackCode === "rate_limited") {
    return {
      ok: false,
      code: "rate_limited",
      message: "Too many incorrect codes. Wait 10 minutes, then try again.",
    };
  }
  if (fallbackCode === "unavailable") {
    return { ok: false, code: "unavailable", message: "Worship Remote is temporarily unavailable." };
  }
  return { ok: false, code: "invalid", message: "That pairing code is invalid, used, or expired." };
}

function connectionFromRow(row: PairingConnectionRow | undefined): RemotePairingConnection | null {
  if (!row?.session_id || !row.setlist_id || !row.team_id || !row.expires_at) return null;
  const channelTopic = row.channel_topic
    || (row.channel_secret ? `worship-remote-session:${row.channel_secret}` : null);
  if (!channelTopic) return null;
  return {
    sessionId: row.session_id,
    setlistId: row.setlist_id,
    teamId: row.team_id,
    channelTopic,
    privateChannel: Boolean(row.private_channel),
    expiresAt: row.expires_at,
  };
}

export async function createCloudRemotePairing(setlistId: string) {
  const parsedSetlistId = uuidSchema.safeParse(setlistId);
  if (!parsedSetlistId.success) throw new Error("Choose a valid setlist before pairing a Remote.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_worship_remote_pairing", {
    p_setlist_id: parsedSetlistId.data,
  });
  const row = (data as Array<{
    session_id?: string;
    qr_token?: string;
    pin_code?: string;
    claim_expires_at?: string;
    expires_at?: string;
    channel_topic?: string;
    private_channel?: boolean;
  }> | null)?.[0];
  if (error || !row?.session_id || !row.qr_token || !row.pin_code || !row.claim_expires_at || !row.expires_at || !row.channel_topic) {
    throw new Error(isAuthenticationError(error) ? "Sign in before pairing a Remote." : "Could not create the Remote pairing session.");
  }

  const url = new URL("/worship-remote", getSiteUrl());
  url.hash = new URLSearchParams({ pair: `${row.session_id}.${row.qr_token}` }).toString();
  const pairingUrl = url.toString();
  return {
    sessionId: row.session_id,
    url: pairingUrl,
    qrDataUrl: await QRCode.toDataURL(pairingUrl, { margin: 1, width: 256 }),
    pinCode: row.pin_code,
    claimExpiresAt: row.claim_expires_at,
    channelTopic: row.channel_topic,
    privateChannel: row.private_channel !== false,
    expiresAt: row.expires_at,
  };
}

export async function claimCloudRemotePairing(pair: string): Promise<RemotePairingClaimResult> {
  const parsed = parseCloudPairingToken(pair);
  if (!parsed) return failedClaim(null);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_worship_remote_pairing", {
    p_session_id: parsed.sessionId,
    p_pairing_code: parsed.token,
  });
  const row = (data as PairingConnectionRow[] | null)?.[0];
  const connection = connectionFromRow(row);
  return error || !connection ? failedClaim(error) : { ok: true, ...connection };
}

export async function claimCloudRemotePairingByPin(pin: string): Promise<RemotePairingClaimResult> {
  const normalizedPin = normalizeRemotePairingPin(pin);
  if (normalizedPin.length !== 6) return failedClaim(null);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_worship_remote_pairing_by_pin", {
    p_pin_code: normalizedPin,
  });
  const row = (data as PairingConnectionRow[] | null)?.[0];
  if (error) return failedClaim(error, "unavailable");
  if (row?.error_code === "auth_required") return failedClaim({ code: "42501" });
  if (row?.error_code === "rate_limited") return failedClaim(null, "rate_limited");
  const connection = connectionFromRow(row);
  return connection ? { ok: true, ...connection } : failedClaim(null);
}

export async function resumeCloudRemotePairing(sessionId: string): Promise<RemotePairingClaimResult> {
  const parsedSessionId = uuidSchema.safeParse(sessionId);
  if (!parsedSessionId.success) return failedClaim(null);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resume_worship_remote_pairing", {
    p_session_id: parsedSessionId.data,
  });
  const connection = connectionFromRow((data as PairingConnectionRow[] | null)?.[0]);
  return error || !connection ? failedClaim(error) : { ok: true, ...connection };
}

export async function revokeCloudRemotePairing(sessionId: string) {
  const parsedSessionId = uuidSchema.safeParse(sessionId);
  if (!parsedSessionId.success) return false;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revoke_worship_remote_pairing", {
    p_session_id: parsedSessionId.data,
  });
  return !error && data === true;
}
