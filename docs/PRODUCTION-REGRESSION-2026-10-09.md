# Production regression restoration — 2026-10-09

Tickets REG-01 and REG-02. Owner: coordinator; independent reviewer: Laura. Standard lane. Local candidate is `output/push-sunday-setlist`, based on reviewed main commit `70522cbe0ee1b725ab4f66c3a2286f818b9d3726`. Original dirty checkout and unrelated work remain preserved.

## Confirmed cause

Vercel production alias `anointed-worship-app.vercel.app` points to deployment `dpl_BsJ8Wt9sU2nTzckrSvinb85c3rdo`, source `redeploy`, commit `064015a6c97a5fa16c81e861f8934b3d59d86acd`, branch `codex/website-production-readiness`. This branch predates the reviewed fixes on main. Its metadata still uses Anointed Worship, dashboard shortcuts have purple icon backgrounds, and Analytics uses the earlier layout.

Supabase production `xvrndwkghxkqsvxxtqym` read-only logs show `permission denied for table events` and `permission denied for table setlists`, including 2026-10-09 12:19:37Z and 12:20:29Z. Catalog inspection confirms authenticated direct INSERT privilege is false for both tables, while EXECUTE is true for `save_event_workspace` and `save_setlist_workspace`. The accidentally deployed code uses direct inserts; reviewed main uses those guarded, atomic workflows. No permissions need to be relaxed.

## Candidate behavior

- Retains Sunday Setlist metadata, transparent purple versioned favicon, app assets and login layout from reviewed main.
- Retains background-free dashboard shortcuts, including hover and keyboard focus.
- Retains updated Analytics with filters, charts, member usage and owner/admin authorization.
- Uses reviewed main event/setlist forms and guarded save workflows, including validation, team checks and atomic error handling. This restores main's scheduling forms rather than shipping the accidental branch's standalone-setlist changes against an incompatible database contract.
- Ports the latest public landing page from `064015a` exactly, preserving the user's latest landing design.
- Adds a prebuild check requiring `VERCEL_GIT_COMMIT_REF=main` for Vercel production. Preview branches remain allowed. Adds creation success/failure tests and a rendered shortcut regression check.

The source guard cannot protect historical commits or reused deployment artifacts that do not contain it. Vercel's Production Branch must be main, and the reviewed commit SHA must be checked before production publication. Do not redeploy the old production-readiness branch.

## Verification

- Production demo build: `E2E_FORCE_DEMO=1 NEXT_PUBLIC_E2E_FORCE_DEMO=1 npm run build` passed, including compilation and TypeScript. Sandbox first attempt failed SWC path canonicalization; permitted local execution passed.
- `npm run typecheck`: passed.
- `npm run lint:website`: passed. The command was followed by audit in the same shell; audit alone initially failed sandbox DNS.
- `npm run test:website`: 118 files, 613 tests passed. Initial sandbox run passed all 608 collected tests but could not collect the Supabase lint suite; permitted local execution passed all suites.
- Targeted actions, forms, preflight, Analytics UI/data tests: 60/60 passed.
- Independent Laura checks: 30/30 tests, scoped strict lint and whitespace passed; code review approved all four initial changed source/test files.
- `npm audit --omit=dev --audit-level=high`: zero vulnerabilities on permitted network retry.
- `npm run security:secrets`: passed, zero findings. A first run scanned generated Node compile-cache test fixtures as a private key; the task-created temporary directory was removed, and the scan passed. No application credential was changed.
- Analytics desktop/mobile browser checks: 4/4 passed, including filtering, charts, narrow viewports, keyboard interaction and reduced motion, with remote Supabase blocked.
- Branding/shortcut browser checks: 6/6 passed on final desktop/mobile run (23.7s), verifying public/team routes, title, images, manifest, icons and shortcut transparency including hover. Initial browser launch used unavailable sandbox browser paths; permitted installed Chromium retry worked. Tests were corrected to await streamed content and select the responsive visible logo. Final combined affected browser evidence is 10/10 across branding and Analytics.
- No database writes, migrations, push, deployment, credential edits or Vercel setting changes performed. Live authenticated creation remains a post-activation acceptance check, not a claimed test pass.

## Gates and activation

Gates 01–12 and 14–22: intake, ownership, source contracts, data flow, existing Next guide, validation and safe failure paths reviewed. Gate 13 N/A: one implementer; independent read-only review only. Gates 23–29: production catalog/log checks and existing guarded RPC SQL reviewed; no schema or grant changes. Gates 30–36: results above. Gate 37: local criteria verified; live activation and authenticated acceptance await approval. No global checks script is provided by the installed engineering-gates skill; project commands were used. No coverage rerun required for this restoration and small preflight branch, whose cases are explicitly tested. No changed backend implementation or dependency.

Reviewer model/effort: assignment `gpt-6.1-sol medium`; effective launch receipt and usage telemetry unavailable. Coordinator model/effort inherited, not independently verifiable. No application repair loop exceeded three attempts.

Next action: obtain explicit approval, integrate only this candidate into main, push/deploy the exact reviewed SHA, keep Vercel production source on main, verify public branding and authenticated event/setlist creation. Production remains affected until activation.
