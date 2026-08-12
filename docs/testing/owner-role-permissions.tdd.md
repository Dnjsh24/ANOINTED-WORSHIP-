# Owner-managed role permissions TDD log

## Scope

Allow the team owner to edit the permissions assigned to built-in roles while keeping owner permissions permanently enabled. Persist policies per team, restrict policy writes to the owner, and use saved policies in website page and server-action authorization.

## RED

Checkpoint: `481e8dc test(rbac): require owner-managed role permissions`

- Added domain coverage for exact team-role overrides and owner lockout prevention.
- Added team-context coverage for loading an empty saved policy as an intentional deny-all override.
- Added component coverage for owner-editable, admin-read-only permission controls.
- Added action integrity coverage for owner checks, validation, and team-scoped upsert.
- Added migration coverage for explicit Data API grants, RLS, team scoping, and owner-only mutation.
- Confirmed the focused suite failed for the missing behavior before production code was added.

## GREEN

- Added `team_role_permissions` with a unique `(team_id, role)` policy, validated permission values, explicit authenticated grants, and RLS.
- Added strict server validation and an owner-only transactional upsert action.
- Kept all owner permissions permanently enabled in the domain model and disabled the owner-column controls in the UI.
- Loaded saved role policies into team context and mutation context.
- Passed saved role policies through navigation, page guards, permission summaries, and mutation checks.
- Added local Supabase security regression coverage proving members can read team policies while non-owners and outsiders cannot mutate them.

## Verification

- Focused RBAC suite: 5 files, 30 tests passed.
- Website unit/integration suite: 81 files, 370 tests passed.
- Website coverage: 87.09% statements, 82.62% branches, 91.01% functions, and 90.14% lines.
- TypeScript: passed.
- Website ESLint: passed with zero warnings.
- Production build: passed.
- Desktop and mobile permission-screen browser checks: passed.
- Secret scan: passed with zero findings.
- Local Supabase integration and database lint: not run because Docker Desktop was unavailable.
- Dependency audit: reported existing high-severity transitive advisories in `brace-expansion`, `js-yaml`, `nanoid`, and `undici`; no dependency files were changed as part of this feature.
