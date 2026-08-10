# Worship Remote authenticated Realtime pairing

Date: 2026-08-11

## Report source

Derived from the production symptom: a phone could redeem a pairing code and load the setlist, but the remote stayed disabled with **Presenter not connected**. Production Realtime logs showed private-channel joins being rejected as `Unauthorized` for both the session channel and the legacy setlist channel.

## User journey

1. An authenticated operator opens Presenter and creates a pairing code.
2. The phone redeems that code and opens Worship Remote.
3. Both clients apply the current Supabase access token to Realtime.
4. Only after authentication succeeds do they join their private Broadcast channels.
5. Presenter heartbeats enable the remote controls. Authorization failures instead show a sign-in/new-code recovery message.

## RED checkpoint

Commit: `d148082 test: reproduce unauthorized Worship Remote pairing`

Command:

```text
npm test -- src/app/presenter/presenter-client.remote-channel.test.tsx "src/app/setlists/[id]/remote/remote-client.test.tsx"
```

Result before the production change: 2 files failed; 3 tests failed and 4 passed. The failures demonstrated that `subscribe()` ran without `auth.getSession()` and `realtime.setAuth(token)`, and that a missing session did not report a channel error.

## GREEN checkpoint

Commit: `ba031af fix: authenticate Worship Remote realtime pairing`

The shared helper now obtains the active session and applies its JWT before any private Realtime subscription. Presenter and remote subscriptions fail closed when authentication is unavailable. The remote can also recover from a late heartbeat without reloading.

Focused result: 2 files passed; 7 tests passed.

## Guarantees

| Guarantee | Evidence |
| --- | --- |
| A private channel is not joined before its JWT is applied. | Presenter hook and cloud-remote call-order tests. |
| A missing session does not fall through to an anonymous private join. | Presenter hook missing-session test. |
| Authorization failures give the operator a recovery action. | Shared helper unit tests and Presenter/remote error rendering. |
| A delayed Presenter heartbeat can restore the remote. | Remote state handler sets the connection active on every heartbeat. |
| Existing database protections remain in place. | Read-only production query found both `realtime.messages` policies; `authenticated` retains schema usage plus `SELECT` and `INSERT`. No migration was added. |

## Verification

- Focused coverage: 8 tests passed; 89.18% statements, 80% branches, 90.9% functions, 100% lines.
- Full unit/integration suite: 69 files passed; 330 tests passed, 1 skipped.
- TypeScript: `npm run typecheck` passed.
- Targeted lint for all changed source and test files passed with no warnings.
- Web production build: `npm run build` passed on Next.js 16.2.12.
- Windows standalone packaging: `desktop/npm run build` passed.
- Secret scan: 473 working files and 1,353 history blobs scanned; no findings.
- Dependency audit: `npm audit --omit=dev` reported existing high-severity advisories in `nanoid@3.3.16` and `undici@7.28.0`; no automatic dependency update was made as part of this scoped pairing fix.

## Manual follow-up

The v0.2.20 installer contains the client authentication repair. After installing it, pair a physical phone with Presenter and confirm that the status changes to connected and slide/output commands are received. No push or website deployment was performed in the client-authentication task.

## Production RLS follow-up

The first repaired client exposed a second production defect: both authenticated clients supplied a JWT, but Realtime continued to reject the secure session topic.

Supabase Realtime constructs its authorization probe rows with `topic` and `extension`; it does not populate `realtime.messages.private`. The existing policies required `realtime.messages.private = true`, so their `SELECT` and `INSERT` checks rejected every probe before the otherwise-valid pairing-session helper could authorize it.

- RED commit: `5743f66 test: reproduce Worship Remote Realtime policy rejection`.
- GREEN commit: `ab7e3eb fix: allow valid Worship Remote Realtime probes`.
- Forward migration: `20260810172514_fix_worship_remote_realtime_authorization.sql`.
- The migration preserves authenticated-role, Broadcast-extension, topic, active membership, role, session ownership, expiry, and revocation checks. It removes only the unavailable synthetic `private` flag predicate.
- The migration was applied to production successfully.
- Rolled-back production probes matching Supabase's synthetic row shape passed for both the session creator and paired phone user.
- Production policy inspection confirmed neither policy still requires the missing flag.
- Focused migration tests: 2 files passed; 6 tests passed.
- Full suite: 70 files passed; 332 tests passed, 1 skipped.
- TypeScript, ESLint, secret scan, and the Next.js production build passed.
- V8 coverage is not applicable to the SQL-only migration (`0/0` instrumentable statements); the production RLS probes provide runtime coverage of both authenticated participants and both `INSERT`/`SELECT` policies.
- The local database lint wrapper could not connect because the local Supabase stack was not running. Production advisors and direct rolled-back verification queries were completed instead.

Previously denied Realtime connections may retain cached authorization state. Fully close Presenter and the phone page, reopen Presenter, and generate one fresh pairing code before the physical acceptance check.
