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
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run test:e2e
```

## Notes

- The app renders a complete demo experience without remote Supabase credentials.
- Private lyrics, chords, practice files, dance notes, messages, and schedules are modeled behind approved team membership in the Supabase migration.
- `npm audit` currently reports a moderate PostCSS advisory through the installed Next.js dependency. npm only offers a forced breaking change, so the dependency graph is left intact pending a safe Next.js patch release.
