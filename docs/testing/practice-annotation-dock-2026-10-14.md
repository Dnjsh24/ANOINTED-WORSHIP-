# SETLIST-31: Minimal annotation dock and colors

Follow-up to SETLIST-30, based on local `35421d7b8fddc33d2c40cbe12005eb1c39901c39`. Final isolated checkout: `C:/Users/danje/.codex/worktrees/practice-dock-polish/Anointed worship setlist - Copy`, branch `codex/practice-dock-polish`. Other work began editing the earlier checkout and sharing its build artifacts during validation, so only the six owned follow-up files were ported to this clean baseline. Other edits and the original workspace are preserved; only the coordinator-owned root ticket record is updated.

## Behavior and design

Practice now has a small centered floating dock with pen, eraser and add-text icons. Muted silver icons, a charcoal translucent surface, restrained borders and selected states replace the wide text toolbar. Controls retain accessible names, hover titles, keyboard focus and 44px targets. Settings appear above the dock only while a tool or note is selected. They remain within the viewport, scroll on short screens, account for the bottom safe area, and sit above mobile song shortcuts and below the Practice modal.

Pen and text each offer yellow, white, coral, sky, mint and lavender presets plus a native custom-color input. Text color saves per note and displays in Stage; drawing pixels preserve the selected pen color. Existing notes without a color load with the previous yellow default. Only six-digit hexadecimal colors pass stored-note validation. Existing typography, movement, slot isolation, Stage read-only display and rehearsal timer behavior remain intact. No dependencies, schema, server authorization, credentials, environment or remote data changes.

## Ownership

Six follow-up files: `src/components/chart-annotations.tsx`, `src/components/chart-annotations.test.tsx`, `src/lib/domain/chart-annotations.ts`, `src/lib/domain/chart-annotations.test.ts`, `e2e/practice-annotations.spec.ts`, and this record. The combined unpublished SETLIST-30/31 branch owns sixteen paths relative to fetched main, including both evidence documents. Coordinator implements; Laura independently reviews. Standard lane, not gold. Native reviewer has no terminal; requested `gpt-6.1-sol medium`, effective settings and usage unavailable. Loaded skills reused: clean-code-typescript, ponytail, accessibility-wcag, code-review, engineering-gates/completion-mandate; frontend-design added for this request.

## Validation

Independent source review approved the icon controls, color boundaries, persisted Stage text color and legacy defaults. Independent targeted Vitest passes 3 files / 11 tests; five-path ESLint with `--max-warnings 0` and diff checks pass. Coordinator runs the same targeted tests, production build, full typecheck and production desktop/mobile journeys. Final results are recorded below after the final mobile layering fix.

Visual review found the existing mobile sidebar could cover the palette's right edge. First repair raises only the dock layer and adds browser hit tests for the actual custom-color inputs, including at 320px. Initial desktop screenshot capture ran before the hydrated dock was ready and returned a Chromium capture error; waiting for the Add text note control resolved the isolated rerun. No application error or assertion was suppressed.

Production dependency audit reports zero vulnerabilities. Full audit reports five unchanged development ESLint-chain advisories. Secret scanner self-test passes with zero findings. SETLIST-30's full website suite/coverage passed 158 files / 1205 tests; this follow-up uses focused color/compatibility tests and affected browser integration because its change is limited to toolbar presentation and validated local note color. No new coverage gate or configuration changes.

Engineering gates 01–22 apply to design, scoped ownership, client hydration, backwards-compatible storage validation, readable typed code and draft preservation. Gates 23–29 are N/A: no database/schema/RLS change. Gates 30–37 require final build/types/lint/targeted unit/browser/accessibility/security/diff evidence. Gold-specific Juan review is N/A. No repeated issue reached three repair attempts.

Local preview: `http://127.0.0.1:3219/setlists/sunday-service/practice`. No push, merge or deployment is performed. Device-local annotation scope is unchanged.

## Final local verification

- Isolated production build (`E2E_FORCE_DEMO=1 NEXT_PUBLIC_E2E_FORCE_DEMO=1 npm run build`) and `npm run typecheck` pass.
- Final five-path scoped ESLint with `--max-warnings 0` and `git diff --check` pass.
- Targeted Vitest in the final isolated checkout: 3 files / 11 tests pass, including legacy default, invalid stored color rejection, custom colors, icon labels and Stage persistence.
- Final production Playwright: 6/6 desktop/mobile journeys pass using `practice-annotations.spec.ts` and the existing Practice integration from `requested-fixes.spec.ts`. Covers selected pen pixels, persisted Stage text color, native touch/mouse movement and drawing, canvas resize, custom picker hit testing at mobile/project and 320px widths, and unchanged timer/Practice behavior. No page errors in the annotation journey.
- Screenshots under `.tmp/dock-final/` visually inspected: compact desktop dock and complete mobile formatting/color panel; mobile sidebar no longer covers controls.
- Laura approves the source and the final layering/hit-test delta. Final isolated source/E2E hashes exactly match approved `7FEDD5B45E0B5F75BCDF1A0442D721A9066B91966B6FEFCB3998AE7562C508EC` / `E332BEA5514FA77DC7FE64146E9C9DFFB5628F799F0A9C445D5161BE49DE15ED`.
- All applicable engineering gates pass. Exact six-file follow-up and combined sixteen-path clean candidate identity/scope are recorded in the root ticket settlement after local commit. No remaining local blocker.

The discarded run during the shared-checkout build overlap is infrastructure evidence, not an application failure or a counted successful check. Final browser checks use the verified isolated build on port 3219.
