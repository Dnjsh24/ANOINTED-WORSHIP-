# Worship website implementation — 2026-10-06

The user approved implementing the revised website plan. Improve performance and shared rehearsal/service tools together. Source baseline: `0cdbfc5ee131172e30033ca14461c79602b39ece`.

## Required behavior

- Every active member can add a song directly. Its immutable creator is the authenticated profile.
- The song creator and owners/admins can edit it directly. Every other member, including worship/band leaders, submits changes for owner/admin approval. Nobody approves their own request.
- For other shared content, members submit proposals and responsible leaders approve them. Personal attendance, readiness, assignment responses and acknowledgements remain immediate.
- Approved song edits preserve the original creator. Pending/rejected requests never modify published content. All permissions apply to database access, not only UI controls.
- Reviewers see the original and proposed values, requester, reason and time. Requests can be approved, rejected with a reason, withdrawn or marked stale. Stale proposals retain their content and require revision.
- Shared preparation belongs to setlists; service running order and assignments belong to events. Stable setlist-song entry IDs preserve annotations and downstream references.
- Save events and assignments atomically. Fix membership/profile joins and visible conflict-check failures.
- Load message inbox summaries and cursor-paged conversation history. Fetch receipts/files only for loaded messages. Retain native history, stable realtime state and safe reconnect/draft behavior.
- Paginate song/setlist/event lists with URL search/filter/sort. Home shows next assignment and outstanding preparation.
- Persist rehearsal focus/minutes, ten preparation tasks, assigned checks and member-song readiness. Preserve separate session-only practice progress and plan export.
- Service order includes songs, prayer, readings, announcements and media cues, durations and responsible people. Existing Stage/Presenter control remains.
- Scheduling includes separate availability/assignment confirmation, missing roles and overlap warnings for rehearsal/service windows.

## Review permissions

Songs require owner/admin review. Setlists, preparation and song-level notes use `setlists.manage`; event edits, assignments and service order use `events.manage`; announcements use `announcements.create`; reminders use `members.manage`. Standalone choreography uses an explicit `dance_notes.review` permission, defaulted to owner/admin and optionally granted to custom roles. Dancer editing permission must not grant approval implicitly.

## Safety and rollout

Use typed, bounded proposals and explicit revision-protected saves. Approval locks request/target and applies changes plus decision metadata transactionally. Preserve existing legacy song-edit rows and event-creation approval behavior. Administrative membership/settings/role changes and other users' private responses/messages are excluded.

Shared changes require connectivity. Keep unsaved inputs after failures, use idempotent sends, and refresh missed updates after reconnect. No offline private-data cache or new paid services.

New migrations are tested locally and provided as reviewed SQL. The confirmed Supabase project is `xvrndwkghxkqsvxxtqym`; independent live schema/history verification remains pending because the connector account cannot inspect that project. No live migration or deployment has been performed. The user's earlier push authorization persists, but the migration must precede deploying website code that depends on the new RPCs.

Root is now the authoritative integrated candidate. Independent implementations used ignored isolated worktrees; current filesystem permissions allow original Git metadata writes. No new commit or push has occurred in this milestone. The coordinator owns final integration and Markdown ticket status.

The SQL Editor candidate is `supabase/manual/20261006_team_workflows.sql`, containing eleven new migrations in a single transaction. It requires the earlier repository schema. Check the project's migration history before executing it; it is a one-time bundle and manual execution does not register Supabase CLI migration versions. If a statement fails, the transaction must roll back; preserve the error and resolve the schema mismatch before retrying. Do not redeploy the previous application after new approval/ownership constraints without reviewing compatibility. Prefer a forward fix for an applied migration; take a database backup before production changes.


## Validation

Each batch records focused unit/integration checks, strict lint and type checks. Database changes receive independent Juan/Laura review and real PostgreSQL/RLS denial/rollback checks where available. Final website coverage/build and production phone/desktop journeys validate the integrated candidate, including touch, keyboard, focus, 320-pixel reflow, duplicate requests/sends, stale approvals, identity changes and reconnect.

Performance fixtures contain 50 members, 1,000 songs, 500 setlists and 10,000 messages. Record before/after results on the same desktop/throttled-phone fixture; target 25% faster median loading on measured slow routes. Do not infer live latency or deployed database correctness from demo tests.

Coordinator owns `tickets.md` and completion evidence. Use at most two specialists with separate file ownership and isolated parallel implementation, and one heavy validation job. Mark Done only after applicable acceptance criteria, checks and independent reviews pass.

## Current behavior overview

Members can propose edits to setlists, events, song entries, announcements, reminders, choreography, rehearsal plans and service orders. Reviewers compare saved and proposed content before deciding. Song creators and owners/admins retain direct editing; other members submit song proposals for owner/admin review. Personal responses stay immediate.

Setlists retain entry identity and annotations when reordered. Event, setlist and linked-event saves reject stale drafts; child entry edits also invalidate older parent proposals. Pending event details and unpublished songs remain private in sync history, including historical snapshots. Deletion records carry identity rather than private text.

Shared rehearsal plans save each song's focus and minutes, assigned preparation tasks and completion responses. Assigned members save readiness and notes. Service orders save timed entries, responsible people, production cues and required roles. Assignment confirmation is separate from availability, with visible schedule conflicts and explicit acknowledgement.

Messages load bounded inbox previews and cursor pages, merge realtime updates during loading, preserve position when older messages are added, and keep draft/send identity on retry. Lists search and sort before pagination; song popularity and favorite filters apply across the full library. The personal dashboard selects the member's own upcoming assignments and assigned outstanding preparation checks.

## Validation checkpoint - 2026-10-07

Final Node 22.23.3 production build, strict website lint and TypeScript checks passed. Website coverage passed 99 files / 476 tests, including guarded assigned-key/Presenter persistence and event-search/sort regressions. Coverage on the configured deterministic surface: statements 87.34%, branches 83.25%, functions 92.4%, lines 90.41%. This percentage does not measure all new UI or database code. Production dependency audit is zero; five pre-existing high development-only dependency findings remain. Final secret scan found no secrets in 541 working files, 1,964 history blobs and 328 commit messages; three oversized historical blobs were excluded.

Scoped PostgreSQL harnesses pass, including approval permissions, stale proposals, rollback, same-team references, private sync history, parent revisions, linked-event conflicts, parent-first entry mutations, pagination and literal global search. Independent native PostgreSQL 18.4 validation passed 49 behavior groups, including authorization waits, concurrent CAS/receipts, deletion/member/reference races, terminal tombstones and authorized explicit song restore. Coordinator and independent Laura application DDL replay passed all 76 chronological migrations and 65 prerequisites plus the exact eleven-file manual bundle with authenticated smoke/privilege assertions. Provider prerequisites and one in-memory pg_net adaptation are explicit; actual Supabase services, lint and live history remain unverified.

Final production browser tests passed 65 with 3 existing platform-specific skips, including all 42 smoke routes on desktop/mobile, keyboard/touch, focus, 320-pixel reflow and zoom checks. Final seven-pair synthetic browser benchmarks use the final build stylesheet: Messages inbox improves 96.6% desktop / 84.4% phone; first-conversation journeys improve 92.5% / 82.2%; Songs improve 90.3% / 61.6%; Setlists improve 90.1% / 71.3%. All measured fixture routes exceed 25%; no deployed latency claim is made.

Juan's independent final architecture and Laura's independent QA reviews passed the integrated affected candidate. T16-T20 and T22 are Done as local implementations; T21 and T08 remain Testing for actual provider/live release checks. Counts: 20/22 overall, 6/7 milestone. The manual SQL bundle remains unapplied and no commit, push or deployment occurred. Final criteria/gates/checks and release limits: [local validation packet](T16-T22-LOCAL-VALIDATION-2026-10-07.md). Rebuild without demo flags before publishing an approved release.
