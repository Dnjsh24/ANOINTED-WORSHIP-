# WOOLY-23 independent release review

Reviewer: Laura. Requested role settings: gpt-6.1-sol, medium. Effective launch settings and usage telemetry are unavailable and remain unverified.

## Candidate and verdict

Independent source approval for product tree `029b1e640002f7efe32bbc67d8aba0f9e96c620c`, branch `codex/wooly-help-20261012`, based on origin/main `c39f90b`. The staged tree was independently verified with `git -c core.fsmonitor=false write-tree`. This document is evidence only and does not modify product files.

No remaining source blocker was found in the reviewed integration. Approval supports the authorized normal feature-branch push with Wooly dormant. It does not approve main merge, deployment activation, remote migrations, support grants, or production data changes. Ticket completion and any gold-lane approval remain the coordinator's responsibility, including required Juan review of the same candidate.

## Independent baseline and findings

Reviewed the release diff against HEAD and actual current-main controls, including layout/AppShell, permission audiences, standalone presenter routes, form and popup markers, profile, members, messages, notices, support authorization, and team-scoped record lookup. Read-only Git inspection required execution outside the filesystem sandbox; initial sandbox diff attempts were discarded rather than used as evidence.

The Analytics dashboard, dashboard CSS, insight charts, Analytics page, and four purple v2 favicon assets independently matched origin/main Git blob hashes. Layout retains the v2 favicon references, WebVitals, and current-main viewport settings. The coordinator additionally reports all 30 protected Analytics/favicon/PWA files match main.

Both server and screen guide audiences use `canForTeam`, preserving explicit permission overrides. `TeamContext.canManageMembers` already resolves overrides. Analytics help and guides restrict access to owners/admins, matching the real page rather than a generic member-management grant. Support requires a verified account and `is_wooly_support`; record queries use the authenticated client and explicit current-team scope.

The authenticated Projector return initially omitted Wooly registration. That finding was repaired and independently tested. The home Analytics copy now names owners/admins. The final compatibility amendment was independently source-reviewed: AppShell retains its original main children when disabled or desktop; stage, practice, confidence and projector retain their original client element when disabled or desktop. Only enabled web output receives the registration wrapper. Stage/practice runtime imports and the projector regression's explicit flag setup/cleanup are present. Existing client props and authorization calls remain intact. The duplicated conditional JSX is a maintenance concern, not a release correctness blocker.

The environment example defaults `WOOLY_TUTORIAL_ENABLED=0`; the provider requires the flag to equal `1` and excludes desktop. Disabled provider output retains children and the standalone Quick Report path.

## Independent checks

All checks used the isolated release worktree, workspace `.tmp` for TEMP/TMP, and one Vitest worker. No browser tools or inspection workarounds were used.

Command prefix: `$env:TEMP=Join-Path (Get-Location) '.tmp'; $env:TMP=$env:TEMP; npx vitest run --config vitest.website.config.ts`.

The independent changed-risk run selected screen-context, server-context, provider, target, target-pointer, page-guides, expanded-help, tutorial-migration, and support-migration tests, with `--exclude 'output/**' --exclude '.tmp/**' --maxWorkers=1`: **9 files, 300 tests passed**, exit 0, 22.54 seconds. The provider suite includes the Maybe later dismissal regression.

After the Projector repair, independently ran `src/app/setlists/[id]/projector/wooly-registration.test.tsx` with the same config/exclusions/worker limit: **1 test passed**, exit 0, 1.74 seconds. Total independent affected checks: **301 tests passed**. These runs preceded the final conditional-wrapper amendment; that amendment was source-reviewed independently, and coordinator-run affected checks cover the final candidate.

Coordinator-reported final checks: 11 affected compatibility tests passed; full website coverage passed **145 files / 1,082 tests**, with statements 87.63%, branches 84.08%, functions 92.68%, lines 90.62%, meeting configured thresholds. Coordinator reports TypeScript, website lint, secret scan (0 findings), and npm audit (0 findings) passed. Production build was still running at review settlement; no build pass is asserted here.

## Remaining unavailable gates

Real browser, keyboard/screen-reader, responsive/PWA and visual acceptance remain unavailable under the explicit browser restriction. Source and DOM unit tests provide meaningful alternatives but do not establish those runtime outcomes.

Live local database/RLS execution remains unavailable because the Docker Linux engine is absent. Static migration tests do not prove deployed RLS behavior. No remote migration, support grant, or activation was performed by this reviewer. Apply and verify migrations and obtain separate activation authorization before enabling Wooly in a remote environment.

Skills reused: code-review, security-review, accessibility-wcag, engineering-gates, completion-mandate, and caveman (chat only). Product files were not edited by this reviewer.
