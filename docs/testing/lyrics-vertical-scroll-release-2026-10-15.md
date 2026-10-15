# LYRICS-35 — Vertical-only lyrics and chords release

User authorized the scoped branch push and protected-main merge on October 15, 2026 (Asia/Manila).

## Behavior and preservation

Practice and Stage previously allowed individual chart rows to scroll sideways. Long ChordPro lyric segments and space-aligned chord rows could exceed the screen. Both modes now wrap chords and lyrics within the chart width, including long words and enlarged text. Inline chords remain grouped above their lyric segment, with spacing between wrapped rows. The header wraps its title and tools and uses bounded vertical scrolling when needed.

Current main delegates Practice to the shared Stage renderer. This release ports 13 layout-class changes to that renderer rather than copying the older working-tree implementation. The saved drawing canvas retains its full backing buffer across viewport changes; a horizontal clipping wrapper now prevents that buffer from widening the chart after a desktop-to-phone resize. Its coordinate origin, vertical extent and stored drawings are unchanged. Current annotations, drawing persistence, rehearsal timer, Practice panel, section navigation, transpose saving, metronome, auto-scroll and song navigation remain intact. The existing floating section navigation is unchanged; the vertical-only behavior applies to chart lyrics/chords and header controls. No new double-view or chord-diagram features are introduced.

Fetched base: `65a0e8a374cbe7552749cc8a0ed622de9c44bbc0`. Branch: `codex/lyrics-vertical-scroll`. Original dirty workspace preserved. Exactly four allowed release paths:

- `src/app/setlists/[id]/stage/stage-mode-client.tsx`
- `src/components/chart-annotations.tsx`
- `e2e/lyrics-vertical-scroll.spec.ts`
- `docs/testing/lyrics-vertical-scroll-release-2026-10-15.md`

Affected routes: `/setlists/[id]/practice` and `/setlists/[id]/stage`. No authorization, team scope, schema, storage format, caching, offline, dependency, environment or credential changes. No database or remote settings mutation. No manual deployment.

## Local verification

- PASS: clean locked dependency install using Node 22.23.3. Existing `@zxing/library` engine warning requests Node 24; install and validation succeed. Lockfile unchanged.
- PASS: `npm run security:secrets`, including detector self-test, history, commit messages and candidate working files; zero findings. No environment/private files staged.
- PASS: `npm audit --omit=dev --audit-level=high`; zero vulnerabilities.
- PASS: `npm run lint:website` and `npm run typecheck`.
- PASS: initial full `npm run test:coverage:website -- --maxWorkers=2`: 159 files / 1,216 tests. All 80% gates pass: statements 87.63%, branches 84.08%, functions 92.68%, lines 90.62%. After the canvas repair, all 25 affected tests, lint, typecheck and production build were rerun and pass; required CI repeats the complete suite on the final candidate.
- PASS: `npm run build`, production Next build with forced demo and Wooly enabled. No credentials or hosted data used.
- PASS: final production Next browser run, 16/16 desktop/mobile tests: new long-text geometry regression, existing floating navigation, annotations, native touch/mouse drawing, stored pixel preservation across resize and Stage reload, formatted notes and timer lifecycle. Each new test checks four viewport sizes at both 100% and 180% font. It waits for the initial drawing buffer before resizing, making the retained-width regression deterministic.
- PASS: final production client fixture, 40/40 cases across Practice/Stage, plain/ChordPro, 100%/180% and 320×740, 390×844, 768×1024, 1440×900, 844×390. Every chart/row rejects horizontal scrolling, every visible lyric/chord range stays within bounds, vertical scroll works, headers fit and no page errors occur. Build: 136 modules. Screenshots inspected for actual mobile Next and inline-token fixture.
- PASS: final `git diff --check`. Final clean ancestry/scope and required CI results are recorded in the PR and coordinator ticket after the commit exists.

The new Playwright test exercises actual Next-rendered demo rows at 320×740, 390×844, 844×390 and 1440×900, with 100% and 180% font sizes. It replaces only rendered text with long synthetic lyrics/chord sequences, leaving layout classes and demo data unchanged. It checks every visible text range, chart/row horizontal scrolling, vertical scrolling, header width and page width. Forced-demo tests block hosted Supabase.

A separate ignored production client fixture mounts the final real shared renderer with plain and ChordPro data and actual annotation components. Only Next Link, the key-save server action and optional Supabase client are stubbed. This supplements the actual Next production browser journeys for the inline-token path.

## Independent review and gates

Laura independently approved the source/test candidate with no actionable findings and passed 25 tests across Stage, Practice adapter/tools, annotations and timer, plus scoped ESLint. Approved source hashes:

- Stage SHA256: `133EFDCE25B3414F68C39E6FE746A2B1FB74880230F9C69CFEDCDD37D7E35A2B`
- Annotation SHA256: `43CE5A93A6B0D0FB8308556D15BAE395C0BE027B7D33DCAD5F1961ED4D65449D`
- E2E SHA256: `8E0D7E328712E4783EC29A05979442B670835FDA2A6B600671A7E75722FBDAF3`

Gates 01–12 and 14–18 pass for scoped intake, ownership, current-main architecture, exact diff, CSS conventions and unchanged contracts. Gate 13 is N/A: one implementer and read-only independent reviewer. Gates 19–29 are N/A: no route loading, SSR, trust-boundary, error-handling, database or access-policy changes. Gates 30–36 pass through build/typecheck/lint/unit/coverage/security verification, independent review and actual browser text enlargement/reflow/interaction checks. Full WCAG audit is outside this layout-only change. Gate 37 requires final clean scope/ancestry, independent final review and protected-main CI before merge. Local database verification is delegated to that required CI job.

Effective agent model/effort and usage telemetry are unavailable; Laura role requested gpt-6.1-sol medium. The first actual production browser run exposed the retained canvas-buffer width on shrink; the clipping wrapper is the first source repair for that issue. No check is waived; required quality/browser/local-database checks must pass on the final candidate before normal merge. Branch retained after merge; no force push, protection bypass or branch deletion.
