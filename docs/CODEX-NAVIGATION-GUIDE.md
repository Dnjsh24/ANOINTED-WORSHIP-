# Codex Navigation Guide

This repository contains a website and a separate desktop application. Website work must avoid `desktop/`, `src/lib/desktop/`, and `src/app/api/desktop/` unless desktop scope is explicitly requested.

## Website ownership

- `src/app/`: App Router pages, server actions, route handlers, and error boundaries.
- `src/components/`: interactive React UI.
- `src/lib/domain/`: validation, permissions, and pure domain logic.
- `src/lib/server/`: server-only authorization and safe network helpers.
- `src/lib/supabase/`: clients, generated types, session proxy, and migration tests.
- `supabase/migrations/`: append-only forward database migrations in timestamp order.
- `public/`: PWA manifest, service worker, icons, and public brand assets.
- `e2e/`: Playwright desktop and mobile website journeys.
- `.github/workflows/website-ci.yml`: release verification.
- `docs/WEBSITE-OPERATIONS.md`: production and recovery procedure.

## Safe change packet

For every website change, report:

1. User-visible behavior and affected routes.
2. Authorization, team-scope, schema, storage, caching, or offline impact.
3. Tests added or updated.
4. Exact lint, typecheck, unit, coverage, build, and E2E results.
5. Migrations or environment variables operators must deploy.
6. Any missing evidence or manual follow-up.

Keep dirty-tree changes that are unrelated to the task. Do not apply migrations, deploy, push, or change credentials without explicit approval.
