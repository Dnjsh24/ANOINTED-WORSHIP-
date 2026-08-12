# Band Leader ministry badge TDD evidence

## Source and user journey

The journey was derived from the Team Management screenshot: a Band Leader should see the specific `Band Leader` and instrument badges without the redundant generic `Band Member` badge.

## RED evidence

Checkpoint: `2621385 test(team): reproduce redundant band member badge`

Command:

```text
npm exec vitest run -- src/components/members-client.test.tsx
```

Result: 1 of 3 tests failed because the Band Leader card still contained `Band Member`.

## GREEN evidence

Checkpoint: `4644fde fix(team): hide redundant band member badge`

The shared display rule removes only the exact `Band Member` label when the member has the `band_leader` role or a `Band Leader` ministry. It is used by the Team Management list, member drawer, and full member profile.

| What is guaranteed | Test or command | Type | Result |
|---|---|---|---|
| Band Leaders retain `Band Leader` and `Electric Guitar` while `Band Member` is hidden | `src/components/members-client.test.tsx` | Component | PASS, 3 tests |
| Website behavior remains green | `npm run test:website` | Unit/integration | PASS, 83 files and 374 tests |
| Coverage remains above the project threshold | `npm run test:coverage:website` | Coverage | PASS: 87.09% statements, 82.62% branches, 91.01% functions, 90.14% lines |
| Website types and lint rules remain valid | `npm run typecheck` and `npm run lint:website` | Static | PASS, zero warnings |
| Production compilation succeeds | `npm run build` | Build | PASS, 43 static pages generated |
| Team Management still loads and responds at supported sizes | focused `e2e/app.spec.ts` member-management test | Browser E2E | PASS, Chromium and Pixel 7 mobile projects |

## Deployment impact and gaps

- Affected routes: `/members` and `/members/[id]`.
- No authorization, team scope, schema, storage, caching, offline, dependency, environment variable, or migration changes.
- The browser fixture does not include a Band Leader with the redundant pair, so the exact label rule is covered by the component regression; browser E2E verifies the surrounding member-management flow.
