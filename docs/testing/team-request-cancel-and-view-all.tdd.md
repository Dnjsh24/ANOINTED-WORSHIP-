# Team request cancel and member-list TDD evidence

## User journeys

- As a team manager, after I reject/cancel a pending join request, I no longer see a broken `Unknown` request that cannot be acted on.
- As a team manager, I can use **View all team members** to clear active filters and return to the complete team list.

## RED evidence

Checkpoint: `d326e2b test(team): reproduce stale canceled request`

Command:

```text
npm exec vitest run -- src/app/members/page.integrity.test.ts src/components/members-client.test.tsx
```

Result: 2 test files failed, 3 tests failed. The server page still queried `pending` and `rejected` rows, rejected requests remained visible, and the view-all control was only a same-page link.

## GREEN evidence

Checkpoint: `b56b7d2 fix(team): remove canceled requests from pending list`

The Team Management query now loads only `status = pending`. Review controls use the state-returning, authorization-checked server action and remove a successfully reviewed request immediately. The view-all control clears search and role filters and focuses the full Active Team panel.

Focused command:

```text
npm exec vitest run -- src/app/members/page.integrity.test.ts src/components/members-client.test.tsx
```

Result: 2 test files passed, 3 tests passed.

## Security and deployment impact

- Existing server-side join-request validation, team authorization, and transactional review RPC remain in use.
- The query remains scoped to the active team and is narrowed to pending rows.
- No schema, storage, environment variable, or migration change is required.

## Final verification

- Focused regression: 2 files passed, 3 tests passed.
- Website unit/integration suite: 83 files passed, 373 tests passed.
- Website coverage: 87.09% statements, 82.62% branches, 91.01% functions, and 90.14% lines.
- Typecheck and website lint passed with zero warnings.
- Production build passed and generated all 43 static pages.
- Focused Playwright flow passed in desktop Chromium and the Pixel 7 mobile project (2 tests).
- Secret scan passed across 1,524 history blobs, 282 commit messages, and 519 working files with zero findings.
- `npm audit --audit-level=high` reports four pre-existing transitive high-severity advisories (`brace-expansion`, `js-yaml`, `nanoid`, and `undici`); this change adds no dependency.
- Local Supabase status could not run because Docker Desktop was unavailable. This fix has no database or migration change.
