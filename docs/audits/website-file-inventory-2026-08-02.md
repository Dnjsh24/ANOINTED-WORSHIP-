# Website File Inventory

Date: 2026-08-02

Parent report: [website-security-production-audit-2026-08-02.md](website-security-production-audit-2026-08-02.md)

Scope: Pre-report snapshot of the current dirty working tree, including tracked, untracked, and deleted entries. The three audit deliverables generated from the snapshot are deliberately excluded to avoid a recursive inventory. Desktop-only files are classified but excluded from the website audit at the user's direction.

## Summary

| Status | Count |
|---|---:|
| Reviewed: authored website text | 340 |
| Excluded: desktop-only per user scope | 39 |
| Deleted from working tree | 11 |
| Classified: binary asset | 9 |
| Classified: generated source | 1 |
| Total | 400 |

Reviewed means the authored text file was included in full-tree automated line scans and inventory review. Security-sensitive, authorization, data, API, deployment, PWA, and accessibility paths also received manual semantic review. Binary content was classified by path/type/reference. Generated source was checked for schema/type drift. Excluded desktop files were not used to score website readiness unless Next.js emitted a related route into the website build.

## File ledger

| Path | Audit status |
|---|---|
| .env.example | Reviewed: authored website text |
| .github/dependabot.yml | Reviewed: authored website text |
| .github/SECURITY.md | Reviewed: authored website text |
| .github/workflows/production-website-monitor.yml | Reviewed: authored website text |
| .github/workflows/website-ci.yml | Reviewed: authored website text |
| .gitignore | Reviewed: authored website text |
| .vercelignore | Reviewed: authored website text |
| AGENTS.md | Reviewed: authored website text |
| CLAUDE.md | Reviewed: authored website text |
| docs/audits/full-product-audit-2026-07-29.html | Reviewed: authored website text |
| docs/audits/full-product-audit-2026-07-29.md | Reviewed: authored website text |
| docs/audits/website-production-change-packet-2026-07-30.md | Reviewed: authored website text |
| docs/audits/website-release-report-2026-07-30.html | Reviewed: authored website text |
| docs/audits/website-remediation-2026-07-29.md | Reviewed: authored website text |
| docs/CODEX-NAVIGATION-GUIDE.md | Reviewed: authored website text |
| docs/mobile-parity-matrix.md | Reviewed: authored website text |
| docs/testing/desktop-production-controller-audit.md | Excluded: desktop-only per user scope |
| docs/testing/desktop-production-operator-acceptance.md | Excluded: desktop-only per user scope |
| docs/testing/desktop-production-self-evaluation.md | Excluded: desktop-only per user scope |
| docs/testing/phase2-audience-looks.tdd.md | Reviewed: authored website text |
| docs/testing/phase2-custom-audience-looks.tdd.md | Reviewed: authored website text |
| docs/testing/presenter-realtime-lifecycle.tdd.md | Reviewed: authored website text |
| docs/testing/projector-persistent-background.tdd.md | Reviewed: authored website text |
| docs/testing/worship-remote-channel-lifecycle.tdd.md | Reviewed: authored website text |
| docs/WEBSITE-OPERATIONS.md | Reviewed: authored website text |
| drop.mjs | Deleted from working tree |
| e2e/app.spec.ts | Reviewed: authored website text |
| e2e/demo-network.ts | Reviewed: authored website text |
| e2e/website-smoke.spec.ts | Reviewed: authored website text |
| eslint.config.mjs | Reviewed: authored website text |
| next.config.ts | Reviewed: authored website text |
| package.json | Reviewed: authored website text |
| package-lock.json | Reviewed: authored website text |
| playwright.config.ts | Reviewed: authored website text |
| postcss.config.mjs | Reviewed: authored website text |
| public/apple-touch-icon.png | Classified: binary asset |
| public/brand/anointed-worship-logo.png | Classified: binary asset |
| public/brand/anointed-worship-logo-transparent.png | Classified: binary asset |
| public/brand/anointed-worship-og.png | Classified: binary asset |
| public/favicon-16x16.png | Classified: binary asset |
| public/favicon-32x32.png | Classified: binary asset |
| public/file.svg | Reviewed: authored website text |
| public/globe.svg | Reviewed: authored website text |
| public/icon-192.png | Classified: binary asset |
| public/icon-512.png | Classified: binary asset |
| public/manifest.json | Reviewed: authored website text |
| public/next.svg | Reviewed: authored website text |
| public/sw.js | Reviewed: authored website text |
| public/vercel.svg | Reviewed: authored website text |
| public/window.svg | Reviewed: authored website text |
| push_error.log | Deleted from working tree |
| README.md | Reviewed: authored website text |
| render.yaml | Reviewed: authored website text |
| scratch/run-seed.js | Deleted from working tree |
| scratch/test-allorigins.js | Deleted from working tree |
| scratch/test-corsproxy.js | Deleted from working tree |
| scratch/test-scrape.js | Deleted from working tree |
| scratch/test-ug.js | Deleted from working tree |
| scratch/test-worshipchords.js | Deleted from working tree |
| scratch-test.mjs | Deleted from working tree |
| scripts/check-production-env.mjs | Reviewed: authored website text |
| scripts/check-production-env.test.mjs | Reviewed: authored website text |
| scripts/check-supabase-lint.mjs | Reviewed: authored website text |
| scripts/check-supabase-lint.test.mjs | Reviewed: authored website text |
| scripts/convert-bible-vpl.mjs | Reviewed: authored website text |
| scripts/import-desktop-bible.mjs | Reviewed: authored website text |
| scripts/scan-secrets.mjs | Reviewed: authored website text |
| scripts/smoke-production.mjs | Reviewed: authored website text |
| scripts/smoke-production.test.mjs | Reviewed: authored website text |
| scripts/test.ts | Deleted from working tree |
| src/app/actions.ts | Reviewed: authored website text |
| src/app/admin/settings/page.tsx | Reviewed: authored website text |
| src/app/analytics/page.tsx | Reviewed: authored website text |
| src/app/announcements/page.tsx | Reviewed: authored website text |
| src/app/api/admin/seed/data.ts | Reviewed: authored website text |
| src/app/api/admin/seed/route.ts | Reviewed: authored website text |
| src/app/api/admin/unseed/route.ts | Reviewed: authored website text |
| src/app/api/bible/route.test.ts | Reviewed: authored website text |
| src/app/api/bible/route.ts | Reviewed: authored website text |
| src/app/api/desktop/backgrounds/[id]/route.ts | Excluded: desktop-only per user scope |
| src/app/api/desktop/presentation-media/[presentationId]/[file]/route.ts | Excluded: desktop-only per user scope |
| src/app/api/desktop/teaching/route.ts | Excluded: desktop-only per user scope |
| src/app/api/events/conflict-check/route.ts | Reviewed: authored website text |
| src/app/api/health/route.ts | Reviewed: authored website text |
| src/app/api/messages/send-scheduled/route.ts | Reviewed: authored website text |
| src/app/api/remove-bpm/route.ts | Reviewed: authored website text |
| src/app/api/songs/cleanup-trash/route.ts | Reviewed: authored website text |
| src/app/api/songs/import/route.ts | Reviewed: authored website text |
| src/app/api/spotify/backfill/route.ts | Reviewed: authored website text |
| src/app/api/spotify/search/route.ts | Reviewed: authored website text |
| src/app/api/web-push/subscribe/route.test.ts | Reviewed: authored website text |
| src/app/api/web-push/subscribe/route.ts | Reviewed: authored website text |
| src/app/auth/callback/route.ts | Reviewed: authored website text |
| src/app/auth/confirm/route.ts | Reviewed: authored website text |
| src/app/dance/[id]/edit/page.tsx | Reviewed: authored website text |
| src/app/dance/[id]/page.tsx | Reviewed: authored website text |
| src/app/dance/page.tsx | Reviewed: authored website text |
| src/app/dashboard/page.tsx | Reviewed: authored website text |
| src/app/error.tsx | Reviewed: authored website text |
| src/app/events/[id]/edit/page.tsx | Reviewed: authored website text |
| src/app/events/[id]/page.tsx | Reviewed: authored website text |
| src/app/events/loading.tsx | Reviewed: authored website text |
| src/app/events/new/page.tsx | Reviewed: authored website text |
| src/app/events/page.tsx | Reviewed: authored website text |
| src/app/favicon.ico | Classified: binary asset |
| src/app/global-error.tsx | Reviewed: authored website text |
| src/app/globals.css | Reviewed: authored website text |
| src/app/layout.tsx | Reviewed: authored website text |
| src/app/loading.tsx | Reviewed: authored website text |
| src/app/login/page.tsx | Reviewed: authored website text |
| src/app/members/[id]/page.tsx | Reviewed: authored website text |
| src/app/members/invite/page.tsx | Reviewed: authored website text |
| src/app/members/page.tsx | Reviewed: authored website text |
| src/app/members/requests/page.tsx | Reviewed: authored website text |
| src/app/messages/loading.tsx | Reviewed: authored website text |
| src/app/messages/page.tsx | Reviewed: authored website text |
| src/app/not-found.tsx | Reviewed: authored website text |
| src/app/page.tsx | Reviewed: authored website text |
| src/app/pending/page.tsx | Reviewed: authored website text |
| src/app/presenter/desktop-background-actions.ts | Excluded: desktop-only per user scope |
| src/app/presenter/desktop-live-actions.ts | Excluded: desktop-only per user scope |
| src/app/presenter/desktop-live-prop-actions.ts | Excluded: desktop-only per user scope |
| src/app/presenter/desktop-lyric-shortcut-actions.ts | Excluded: desktop-only per user scope |
| src/app/presenter/desktop-motion-preset-actions.ts | Excluded: desktop-only per user scope |
| src/app/presenter/desktop-pptx-actions.ts | Excluded: desktop-only per user scope |
| src/app/presenter/desktop-production-layout-actions.ts | Excluded: desktop-only per user scope |
| src/app/presenter/desktop-scene-layer-actions.ts | Excluded: desktop-only per user scope |
| src/app/presenter/kinetic-canvas.tsx | Reviewed: authored website text |
| src/app/presenter/page.tsx | Reviewed: authored website text |
| src/app/presenter/presentation-draft-actions.ts | Reviewed: authored website text |
| src/app/presenter/presenter-client.remote-channel.test.tsx | Reviewed: authored website text |
| src/app/presenter/presenter-client.tsx | Reviewed: authored website text |
| src/app/presenter/remote-pairing-actions.ts | Reviewed: authored website text |
| src/app/presenter/timeline-editor.tsx | Reviewed: authored website text |
| src/app/profile/page.tsx | Reviewed: authored website text |
| src/app/reminders/page.tsx | Reviewed: authored website text |
| src/app/setlists/[id]/add-song/page.tsx | Reviewed: authored website text |
| src/app/setlists/[id]/confidence/confidence-client.tsx | Reviewed: authored website text |
| src/app/setlists/[id]/confidence/page.tsx | Reviewed: authored website text |
| src/app/setlists/[id]/edit/page.tsx | Reviewed: authored website text |
| src/app/setlists/[id]/page.tsx | Reviewed: authored website text |
| src/app/setlists/[id]/presenter/page.tsx | Reviewed: authored website text |
| src/app/setlists/[id]/presenter/presenter-client.tsx | Reviewed: authored website text |
| src/app/setlists/[id]/projector/page.tsx | Reviewed: authored website text |
| src/app/setlists/[id]/projector/projector-background.test.tsx | Reviewed: authored website text |
| src/app/setlists/[id]/projector/projector-background.tsx | Reviewed: authored website text |
| src/app/setlists/[id]/projector/projector-client.background.test.tsx | Reviewed: authored website text |
| src/app/setlists/[id]/projector/projector-client.tsx | Reviewed: authored website text |
| src/app/setlists/[id]/remote/page.tsx | Reviewed: authored website text |
| src/app/setlists/[id]/remote/remote-client.test.tsx | Reviewed: authored website text |
| src/app/setlists/[id]/remote/remote-client.tsx | Reviewed: authored website text |
| src/app/setlists/[id]/stage/page.tsx | Reviewed: authored website text |
| src/app/setlists/[id]/stage/stage-mode-client.tsx | Reviewed: authored website text |
| src/app/setlists/loading.tsx | Reviewed: authored website text |
| src/app/setlists/new/page.tsx | Reviewed: authored website text |
| src/app/setlists/page.tsx | Reviewed: authored website text |
| src/app/setlists/templates/page.tsx | Reviewed: authored website text |
| src/app/songs/[id]/edit/page.tsx | Reviewed: authored website text |
| src/app/songs/[id]/page.tsx | Reviewed: authored website text |
| src/app/songs/loading.tsx | Reviewed: authored website text |
| src/app/songs/new/page.tsx | Reviewed: authored website text |
| src/app/songs/page.tsx | Reviewed: authored website text |
| src/app/songs/trash/page.tsx | Reviewed: authored website text |
| src/app/sync/page.tsx | Reviewed: authored website text |
| src/app/teams/join/page.tsx | Reviewed: authored website text |
| src/app/teams/new/page.tsx | Reviewed: authored website text |
| src/app/teams/page.tsx | Reviewed: authored website text |
| src/components/action-form.tsx | Reviewed: authored website text |
| src/components/analytics-dashboard.tsx | Reviewed: authored website text |
| src/components/announcements-feed.tsx | Reviewed: authored website text |
| src/components/app-shell.tsx | Reviewed: authored website text |
| src/components/app-shell-actions.tsx | Reviewed: authored website text |
| src/components/arrangement-editor.tsx | Reviewed: authored website text |
| src/components/attendance-roster.tsx | Reviewed: authored website text |
| src/components/attendance-toggle.tsx | Reviewed: authored website text |
| src/components/brand-mark.tsx | Reviewed: authored website text |
| src/components/change-key-button.tsx | Reviewed: authored website text |
| src/components/chord-diagrams.tsx | Reviewed: authored website text |
| src/components/dance-chart-form.tsx | Reviewed: authored website text |
| src/components/dance-library-list.tsx | Reviewed: authored website text |
| src/components/delete-song-button.tsx | Reviewed: authored website text |
| src/components/desktop-background-library.tsx | Excluded: desktop-only per user scope |
| src/components/desktop-live-source.tsx | Excluded: desktop-only per user scope |
| src/components/desktop-live-source-panel.tsx | Excluded: desktop-only per user scope |
| src/components/desktop-output-controls.tsx | Excluded: desktop-only per user scope |
| src/components/desktop-sync-dashboard.tsx | Excluded: desktop-only per user scope |
| src/components/desktop-sync-status.tsx | Excluded: desktop-only per user scope |
| src/components/edit-arrangement-button.tsx | Reviewed: authored website text |
| src/components/edit-band-notes-button.tsx | Reviewed: authored website text |
| src/components/event-delete-button.tsx | Reviewed: authored website text |
| src/components/event-form.tsx | Reviewed: authored website text |
| src/components/events-client.tsx | Reviewed: authored website text |
| src/components/install-app-button.tsx | Reviewed: authored website text |
| src/components/invite-member-form.tsx | Reviewed: authored website text |
| src/components/join-requests-client.tsx | Reviewed: authored website text |
| src/components/join-team-form.tsx | Reviewed: authored website text |
| src/components/live-gmt8-time.test.tsx | Reviewed: authored website text |
| src/components/live-gmt8-time.tsx | Reviewed: authored website text |
| src/components/local-time.tsx | Reviewed: authored website text |
| src/components/media-uploader.tsx | Reviewed: authored website text |
| src/components/members-client.tsx | Reviewed: authored website text |
| src/components/messages-client.tsx | Reviewed: authored website text |
| src/components/mobile-icon-rail.tsx | Reviewed: authored website text |
| src/components/notice-composer.tsx | Reviewed: authored website text |
| src/components/notification-bell.tsx | Reviewed: authored website text |
| src/components/offline-preloader.tsx | Reviewed: authored website text |
| src/components/pdf-page-canvas.tsx | Reviewed: authored website text |
| src/components/pending-client.tsx | Reviewed: authored website text |
| src/components/photo-picker-button.tsx | Reviewed: authored website text |
| src/components/profile-form.tsx | Reviewed: authored website text |
| src/components/pwa-register.tsx | Reviewed: authored website text |
| src/components/quick-report-button.tsx | Reviewed: authored website text |
| src/components/save-as-template-button.tsx | Reviewed: authored website text |
| src/components/search-box.tsx | Reviewed: authored website text |
| src/components/setlist-form.tsx | Reviewed: authored website text |
| src/components/setlists-client.tsx | Reviewed: authored website text |
| src/components/setlist-song-order.tsx | Reviewed: authored website text |
| src/components/setlist-song-picker.tsx | Reviewed: authored website text |
| src/components/setlist-template-picker.tsx | Reviewed: authored website text |
| src/components/settings-client-view.tsx | Reviewed: authored website text |
| src/components/settings-form.tsx | Reviewed: authored website text |
| src/components/share-button.tsx | Reviewed: authored website text |
| src/components/slide-background-picker.tsx | Reviewed: authored website text |
| src/components/song-form.tsx | Reviewed: authored website text |
| src/components/song-library-grid.tsx | Reviewed: authored website text |
| src/components/song-trash-list.tsx | Reviewed: authored website text |
| src/components/song-usage-heatmap.tsx | Reviewed: authored website text |
| src/components/song-viewer.tsx | Reviewed: authored website text |
| src/components/spotify-search.tsx | Reviewed: authored website text |
| src/components/team-code-actions.tsx | Reviewed: authored website text |
| src/components/ui/avatar.tsx | Reviewed: authored website text |
| src/components/ui/badge.tsx | Reviewed: authored website text |
| src/components/ui/button.tsx | Reviewed: authored website text |
| src/components/ui/card.tsx | Reviewed: authored website text |
| src/components/ui/input.tsx | Reviewed: authored website text |
| src/lib/action-state.ts | Reviewed: authored website text |
| src/lib/bible/catalog.ts | Reviewed: authored website text |
| src/lib/desktop/audience-looks.test.ts | Excluded: desktop-only per user scope |
| src/lib/desktop/audience-looks.ts | Excluded: desktop-only per user scope |
| src/lib/desktop/background-media.test.ts | Excluded: desktop-only per user scope |
| src/lib/desktop/background-media.ts | Excluded: desktop-only per user scope |
| src/lib/desktop/db.ts | Excluded: desktop-only per user scope |
| src/lib/desktop/live-props.ts | Excluded: desktop-only per user scope |
| src/lib/desktop/live-sources.test.ts | Excluded: desktop-only per user scope |
| src/lib/desktop/live-sources.ts | Excluded: desktop-only per user scope |
| src/lib/desktop/lyric-shortcuts.ts | Excluded: desktop-only per user scope |
| src/lib/desktop/motion-presets.ts | Excluded: desktop-only per user scope |
| src/lib/desktop/pptx-import.test.ts | Excluded: desktop-only per user scope |
| src/lib/desktop/pptx-import.ts | Excluded: desktop-only per user scope |
| src/lib/desktop/production-layout.ts | Excluded: desktop-only per user scope |
| src/lib/desktop/runtime.ts | Excluded: desktop-only per user scope |
| src/lib/desktop/scene-layers.ts | Excluded: desktop-only per user scope |
| src/lib/desktop/stage-layout.test.ts | Excluded: desktop-only per user scope |
| src/lib/desktop/stage-layout.ts | Excluded: desktop-only per user scope |
| src/lib/desktop/sync.ts | Excluded: desktop-only per user scope |
| src/lib/desktop/workspace.ts | Excluded: desktop-only per user scope |
| src/lib/detect-key-from-chords.test.ts | Reviewed: authored website text |
| src/lib/detect-key-from-chords.ts | Reviewed: authored website text |
| src/lib/domain/activity.ts | Reviewed: authored website text |
| src/lib/domain/attendance.test.ts | Reviewed: authored website text |
| src/lib/domain/attendance.ts | Reviewed: authored website text |
| src/lib/domain/chords.test.ts | Reviewed: authored website text |
| src/lib/domain/chords.ts | Reviewed: authored website text |
| src/lib/domain/chord-shapes.ts | Reviewed: authored website text |
| src/lib/domain/event-types.ts | Reviewed: authored website text |
| src/lib/domain/files.test.ts | Reviewed: authored website text |
| src/lib/domain/files.ts | Reviewed: authored website text |
| src/lib/domain/interaction-regression.test.ts | Reviewed: authored website text |
| src/lib/domain/join-requests.test.ts | Reviewed: authored website text |
| src/lib/domain/join-requests.ts | Reviewed: authored website text |
| src/lib/domain/post-login.test.ts | Reviewed: authored website text |
| src/lib/domain/post-login.ts | Reviewed: authored website text |
| src/lib/domain/presentation.test.ts | Reviewed: authored website text |
| src/lib/domain/presentation.ts | Reviewed: authored website text |
| src/lib/domain/rbac.test.ts | Reviewed: authored website text |
| src/lib/domain/rbac.ts | Reviewed: authored website text |
| src/lib/domain/service-templates.ts | Reviewed: authored website text |
| src/lib/domain/setlist-readiness.test.ts | Reviewed: authored website text |
| src/lib/domain/setlist-readiness.ts | Reviewed: authored website text |
| src/lib/domain/setlists.test.ts | Reviewed: authored website text |
| src/lib/domain/setlists.ts | Reviewed: authored website text |
| src/lib/domain/team-code.test.ts | Reviewed: authored website text |
| src/lib/domain/team-code.ts | Reviewed: authored website text |
| src/lib/domain/time.test.ts | Reviewed: authored website text |
| src/lib/domain/time.ts | Reviewed: authored website text |
| src/lib/domain/validators.test.ts | Reviewed: authored website text |
| src/lib/domain/validators.ts | Reviewed: authored website text |
| src/lib/presentation/control-protocol.test.ts | Reviewed: authored website text |
| src/lib/presentation/control-protocol.ts | Reviewed: authored website text |
| src/lib/presentation/lan-remote-static.test.ts | Reviewed: authored website text |
| src/lib/presentation/live-snapshot.test.ts | Reviewed: authored website text |
| src/lib/presentation/live-snapshot.ts | Reviewed: authored website text |
| src/lib/presentation/lyric-shortcuts.test.ts | Reviewed: authored website text |
| src/lib/presentation/lyric-shortcuts.ts | Reviewed: authored website text |
| src/lib/presentation/remote-pairing.test.ts | Reviewed: authored website text |
| src/lib/presentation/remote-pairing.ts | Reviewed: authored website text |
| src/lib/presentation/use-desktop-remote-channel.test.tsx | Reviewed: authored website text |
| src/lib/presentation/use-desktop-remote-channel.ts | Reviewed: authored website text |
| src/lib/presentation/use-remote-command-subscription.ts | Reviewed: authored website text |
| src/lib/push-notifications.ts | Reviewed: authored website text |
| src/lib/rate-limit.test.ts | Reviewed: authored website text |
| src/lib/rate-limit.ts | Reviewed: authored website text |
| src/lib/sample-data.ts | Reviewed: authored website text |
| src/lib/server/cron-auth.test.ts | Reviewed: authored website text |
| src/lib/server/cron-auth.ts | Reviewed: authored website text |
| src/lib/server/safe-error.test.ts | Reviewed: authored website text |
| src/lib/server/safe-error.ts | Reviewed: authored website text |
| src/lib/server/safe-remote-html.test.ts | Reviewed: authored website text |
| src/lib/server/safe-remote-html.ts | Reviewed: authored website text |
| src/lib/supabase/client.ts | Reviewed: authored website text |
| src/lib/supabase/database.types.ts | Classified: generated source |
| src/lib/supabase/env.test.ts | Reviewed: authored website text |
| src/lib/supabase/env.ts | Reviewed: authored website text |
| src/lib/supabase/migration.test.ts | Reviewed: authored website text |
| src/lib/supabase/proxy.ts | Reviewed: authored website text |
| src/lib/supabase/server.ts | Reviewed: authored website text |
| src/lib/supabase/team-context.test.ts | Reviewed: authored website text |
| src/lib/supabase/team-context.ts | Reviewed: authored website text |
| src/lib/supabase/team-guard.ts | Reviewed: authored website text |
| src/lib/supabase/website-security-migration.test.ts | Reviewed: authored website text |
| src/lib/types.ts | Reviewed: authored website text |
| src/lib/utils.ts | Reviewed: authored website text |
| src/lib/voice-key-detector.test.ts | Reviewed: authored website text |
| src/lib/voice-key-detector.ts | Reviewed: authored website text |
| src/proxy.ts | Reviewed: authored website text |
| src/types/anointed-desktop.d.ts | Reviewed: authored website text |
| src/types/browser.d.ts | Reviewed: authored website text |
| src/types/node-sqlite.d.ts | Reviewed: authored website text |
| supabase/.gitignore | Reviewed: authored website text |
| supabase/config.toml | Reviewed: authored website text |
| supabase/migrations/20260630010000_anointed_worship_mvp.sql | Reviewed: authored website text |
| supabase/migrations/20260630011000_fix_team_creation_bootstrap.sql | Reviewed: authored website text |
| supabase/migrations/20260630023000_harden_supabase_policies.sql | Reviewed: authored website text |
| supabase/migrations/20260630030000_interaction_mvp_persistence.sql | Reviewed: authored website text |
| supabase/migrations/20260630040000_fix_profile_visibility_for_join_requests.sql | Reviewed: authored website text |
| supabase/migrations/20260630050000_enable_realtime_join_requests.sql | Reviewed: authored website text |
| supabase/migrations/20260630060000_fix_teams_select_policy_for_join.sql | Reviewed: authored website text |
| supabase/migrations/20260630070000_allow_admin_insert_members.sql | Reviewed: authored website text |
| supabase/migrations/20260701000000_add_channel_avatar.sql | Reviewed: authored website text |
| supabase/migrations/20260702000000_add_event_approval_status.sql | Reviewed: authored website text |
| supabase/migrations/20260702010000_targeted_announcements_reminders.sql | Reviewed: authored website text |
| supabase/migrations/20260702020000_notice_acknowledgements_recurring_reminders.sql | Reviewed: authored website text |
| supabase/migrations/20260702030000_service_templates_conflicts_setlist_history.sql | Reviewed: authored website text |
| supabase/migrations/20260703000000_fix_message_channel_membership_insert.sql | Reviewed: authored website text |
| supabase/migrations/20260703010000_backfill_default_team_channels.sql | Reviewed: authored website text |
| supabase/migrations/20260703020000_atomic_team_workspace_lifecycle.sql | Reviewed: authored website text |
| supabase/migrations/20260703030000_fix_create_team_workspace_template_conflict.sql | Reviewed: authored website text |
| supabase/migrations/20260703040000_enable_realtime_messages.sql | Reviewed: authored website text |
| supabase/migrations/20260704000000_profile_avatar_storage.sql | Reviewed: authored website text |
| supabase/migrations/20260704010000_cancel_join_requests.sql | Reviewed: authored website text |
| supabase/migrations/20260704020000_add_dance_details_video_url.sql | Reviewed: authored website text |
| supabase/migrations/20260704030000_add_service_rehearsal_event_type.sql | Reviewed: authored website text |
| supabase/migrations/20260704040000_feedback_reports.sql | Reviewed: authored website text |
| supabase/migrations/20260704050000_add_rehearsal_date.sql | Reviewed: authored website text |
| supabase/migrations/20260704060000_add_setlist_song_youtube_url.sql | Reviewed: authored website text |
| supabase/migrations/20260704070000_make_bpm_optional.sql | Reviewed: authored website text |
| supabase/migrations/20260707000000_allow_admin_delete_members.sql | Reviewed: authored website text |
| supabase/migrations/20260707095728_create_user_annotations.sql | Reviewed: authored website text |
| supabase/migrations/20260708115600_harden_rpc_functions.sql | Reviewed: authored website text |
| supabase/migrations/20260708121500_fix_public_bucket_listing.sql | Reviewed: authored website text |
| supabase/migrations/20260714000000_push_notifications.sql | Reviewed: authored website text |
| supabase/migrations/20260714180000_add_setlist_song_arrangement.sql | Reviewed: authored website text |
| supabase/migrations/20260714190000_add_presentation_settings.sql | Reviewed: authored website text |
| supabase/migrations/20260714200000_presentation_media_bucket.sql | Reviewed: authored website text |
| supabase/migrations/20260719000000_fix_push_notification_triggers.sql | Reviewed: authored website text |
| supabase/migrations/20260719010000_security_advisor_fixes.sql | Reviewed: authored website text |
| supabase/migrations/20260721000000_add_song_image_url.sql | Reviewed: authored website text |
| supabase/migrations/20260722010000_add_song_deleted_at.sql | Reviewed: authored website text |
| supabase/migrations/20260722020000_add_announcement_is_pinned.sql | Reviewed: authored website text |
| supabase/migrations/20260723000000_add_band_notes.sql | Reviewed: authored website text |
| supabase/migrations/20260723000001_add_message_receipts.sql | Reviewed: authored website text |
| supabase/migrations/20260723000002_add_ministries_array.sql | Reviewed: authored website text |
| supabase/migrations/20260723000003_add_activity_logs.sql | Reviewed: authored website text |
| supabase/migrations/20260724000000_feature_24_32_39.sql | Reviewed: authored website text |
| supabase/migrations/20260725000000_fix_missing_columns.sql | Reviewed: authored website text |
| supabase/migrations/20260726000000_desktop_offline_sync_foundation.sql | Reviewed: authored website text |
| supabase/migrations/20260726000001_offline_sync_rls_policies.sql | Reviewed: authored website text |
| supabase/migrations/20260726000002_private_worship_remote_realtime.sql | Reviewed: authored website text |
| supabase/migrations/20260726000003_worship_remote_pairing_sessions.sql | Reviewed: authored website text |
| supabase/migrations/20260727000000_harden_worship_remote_pairing_function_permissions.sql | Reviewed: authored website text |
| supabase/migrations/20260727000001_make_worship_remote_pairing_one_time.sql | Reviewed: authored website text |
| supabase/migrations/20260727000002_move_remote_policy_helper_to_private_schema.sql | Reviewed: authored website text |
| supabase/migrations/20260728000000_setlist_presentation_sync.sql | Reviewed: authored website text |
| supabase/migrations/20260729000000_add_missing_messages_columns.sql | Reviewed: authored website text |
| supabase/migrations/20260729000001_fix_notify_new_message_member_id.sql | Reviewed: authored website text |
| supabase/migrations/20260729000002_harden_website_boundaries.sql | Reviewed: authored website text |
| supabase/migrations/20260730000000_fix_website_remote_pairing_digest.sql | Reviewed: authored website text |
| supabase/migrations/20260730010000_add_profile_birthday.sql | Reviewed: authored website text |
| supabase/migrations/20260802000000_optimize_website_rls_and_indexes.sql | Reviewed: authored website text |
| supabase/migrations/20260802010000_harden_attendance_notifications.sql | Reviewed: authored website text |
| supabase/migrations/20260802020000_consolidate_website_rls_policies.sql | Reviewed: authored website text |
| supabase/seed.sql | Reviewed: authored website text |
| supabase/tests/website_security_regression.sql | Reviewed: authored website text |
| test.mjs | Deleted from working tree |
| test-db.mjs | Reviewed: authored website text |
| tsconfig.json | Reviewed: authored website text |
| vercel.json | Reviewed: authored website text |
| vitest.config.ts | Reviewed: authored website text |
| vitest.setup.ts | Reviewed: authored website text |
| vitest.website.config.ts | Reviewed: authored website text |

## Coverage notes

- The inventory source was git ls-files --cached --others --exclude-standard, with the three 2026-08-02 audit outputs excluded, so ignored generated dependencies/build outputs are not represented.
- node_modules, .next, coverage, installers, packaged runtimes, and other ignored generated artifacts were classified outside the authored-file ledger and were not reviewed line by line.
- Deleted tracked entries remain in this ledger so their production/GitHub relevance is not silently lost.
- Lockfiles and generated database types were checked structurally and for dependency/schema drift; they were not interpreted as hand-authored business logic.
