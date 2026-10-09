# Website fixes — final change packet

All five requested implementation tickets are complete locally. Candidate: usage integration commit `830c37a341ec7acd591d0c72eaa4c0c271da656a` plus the coordinator's reviewed frontend working-tree changes. No push, deployment, remote migration, credential change, or desktop application modification occurred.

## Resulting behavior

- New/edit setlists support phone drag handles, touch-aware activation and pointer collision after scrolling. Mouse and keyboard remain supported; an Add button supplies an accessible alternative. Duplicates are prevented and edit selections retain their submitted IDs. Phone song-order controls wrap without forcing horizontal overflow.
- Dashboard Quick Access icons have transparent backgrounds, including hover. Cards, labels, targets and icon color remain intact.
- Team Management uses actual presence for Online and persistent timestamps for relative last seen. Managers can rank approximate app hours, sessions, active days and daily dates in a selected UTC range, on Team Management and Analytics. Empty or unavailable data is stated honestly.
- Messages opens the inbox. A conversation opens only after selection or an explicit available channel URL. Browser navigation and the chat-list control preserve list/conversation history without reopening a closed chat. Conversation changes clear private drafts/replies/schedules and attachment previews. Inbox failures remain visible.
- Route audit repairs the demo setlist pin, preserves Next.js history state during QR cleanup, and fixes phone setlist overflow. The route matrix and fixture limits are in [the audit](WEBSITE-ROUTE-AUDIT-2026-10-05.md).

## Data, authorization and deployment

The new append-only migration is `supabase/migrations/20261005010000_member_usage_tracking.sql`. It stores one current usage cursor per member and daily counters. The server derives identity from authentication, verifies active membership, locks that member's row, deduplicates UTC minutes, and does not fill disconnected gaps. Owner/admin SELECT policies are team-scoped; direct writes are revoked. Only visible, online windows with recent trusted input attempt heartbeats. Hours are activity estimates, not exact elapsed time.

No historical usage is inferred. Live tracking requires applying the migration with explicit operator authorization. There are no new environment variables or storage buckets. Before migration deployment the application remains usable and reports unavailable usage. Existing offline/cache handling is unchanged; offline activity receives no credit. Deployment and forward recovery are documented in [MEMBER-USAGE-TRACKING.md](MEMBER-USAGE-TRACKING.md).

## Validation

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed, including final history fix |
| `npm run lint:website` | Passed; focused strict lint passed after final history/test changes |
| `npm run test:coverage:website -- --maxWorkers=2` | 67 files / 322 tests passed; configured website coverage thresholds passed |
| Coverage | Statements 85.21%, branches 81.81%, functions 89.87%, lines 88.23%; existing configured deterministic surface |
| `npm run build` with `E2E_FORCE_DEMO=1 NEXT_PUBLIC_E2E_FORCE_DEMO=1` | Optimized webpack build passed; final rebuild passed after history fix |
| `npm run security:secrets` | Passed, no findings; oversized history exclusions reported by the scanner |
| Isolated PostgreSQL usage harness | Passed accounting, UTC, deduplication, session, RLS, denied writes, foreign-key and cascade cases |
| Production requested-fixes / website-smoke / security-accessibility suite | 27/28 initially passed; one cancellation test acted during the toolkit's short click-suppression window |
| Final affected production browser rerun | 6/6 passed: chat-history, cancellation/keyboard Add, and existing message controls on desktop and phone |
| Independent reviews | Laura passed scoped frontend and gold usage/route QA; Juan passed usage architecture and final route history resolution |

The corrected cancellation test waits for click suppression to expire. The final rerun also exercises the final chat-history change. All previously failing cases pass. Unchanged production checks include two 39-route smoke journeys, actual normal-height phone touch/auto-scroll, transparent icon styling, usage date controls, twelve real-link Back/Forward journeys per viewport, nonce CSP, safe embeds, authenticated-cache isolation, focus trapping, and 320-pixel reflow.

## Remaining release limits

- Native Supabase/Docker was unavailable. The real SQL/helper passed in isolated PostgreSQL fixtures; full Supabase migration compatibility and simultaneous connections remain operator verification. Row locking serializes concurrent calls by design, and both independent reviewers found no local implementation blocker.
- Live auth, private dance records, membership changes and paired remote sessions require authenticated fixtures. Code and relevant unit checks were reviewed; live browser evidence is not claimed.
- `npm audit --json` reports 16 existing advisories: four moderate, eleven high, one critical, including Next.js. Dependencies were not changed. The dependency release gate remains failed; these feature fixes are not a clean-release security claim.
- The build used forced demo mode. Vercel production environment preflight was skipped locally. Rebuild with the intended production environment before deployment; do not publish the demo validation artifact.

Detailed ticket history and exact final browser command are in [tickets.md](../tickets.md).
