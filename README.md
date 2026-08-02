# Anointed Worship

Private worship team management app for setlists, chord charts, schedules, member approvals, messages, and ministry files.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS
- Supabase Auth, Postgres, Storage, and Row Level Security
- Vitest, Testing Library, Playwright

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env.local` and fill in Supabase values. For local Supabase, start the stack first:

```bash
npm run supabase:start
```

3. Run the app:

```bash
npm run dev
```

## Verification

```bash
npm run security:secrets
npm audit --omit=dev --audit-level=high
npm run lint:website
npm run typecheck
npm run test:website
npm run test:coverage:website
npm run build
E2E_FORCE_DEMO=1 npm run test:e2e
```

The website is deployed through Vercel. Release configuration, local database
verification, smoke checks, monitoring, and rollback instructions are documented
in [docs/WEBSITE-OPERATIONS.md](docs/WEBSITE-OPERATIONS.md).

## Notes

- The app renders a complete demo experience without remote Supabase credentials.
- Private lyrics, chords, practice files, dance notes, messages, and schedules are modeled behind approved team membership in the Supabase migration.
- Supabase migrations and authorization checks must be rehearsed against the isolated local stack before production changes are approved.
