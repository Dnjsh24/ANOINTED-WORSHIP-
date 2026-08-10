"use client";

type SessionLookupResult = {
  data: { session: { access_token: string } | null };
  error: { message?: string } | null;
};

export type RealtimeAuthClient = {
  auth: {
    getSession: () => PromiseLike<SessionLookupResult>;
  };
  realtime: {
    setAuth: (token: string) => PromiseLike<void>;
  };
};

export async function authenticateRealtimeClient(client: RealtimeAuthClient) {
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw new Error("Your sign-in session could not authorize Worship Remote.");
  }

  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error("Sign in again before connecting Worship Remote.");
  }

  // Private Broadcast channels evaluate realtime.messages RLS at join time.
  // Bootstrap the socket with the authenticated user JWT before that join.
  await client.realtime.setAuth(accessToken);
}

export function realtimeConnectionErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/unauthor|permission|rls/i.test(message)) {
    return "Realtime authorization was rejected. Sign out, sign in again, and create a new pairing code.";
  }
  return message || "The private Presenter channel could not be joined.";
}
