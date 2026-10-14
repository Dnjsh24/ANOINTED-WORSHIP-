# WOOLY-24 independent SQL handoff review

Reviewer: Laura. Requested settings: gpt-6.1-sol, medium; effective launch settings and usage telemetry unavailable/unverified.

## Verdict and candidate

Approved for local SQL handoff on source review and independent packaging comparison. No remaining source blocker found. This is not approval or evidence of remote execution, live RLS acceptance, deployment, or feature activation.

Migration baseline: pushed release commit `ad50f67`. Reviewed files and SHA-256:

| File | SHA-256 |
| --- | --- |
| supabase/wooly-sql-editor-setup.sql | A257D66A582877974DCCD2822DA91C8DB5E0C5882CE9BF7ED62FC16E5405B05F |
| supabase/wooly-support-account.sql | 9CCBF7FA928E27C9B071ADC8AA96801918F4416FC3E191A1C0F9A4C9EB485E3D |
| docs/WOOLY-SUPABASE-SETUP.md | D931050F6FD81E5DD98E119C1BCBA5B3F7A842BE4F0025434110EA48A84633AC |
| output/wooly-push/package-sql.cjs | D3AA27085826D6A79047CF2894845FD45468016F865298423D1750F78C9B28A7 |

## Independent checks and findings

Used PowerShell read-only inspection, `git show ad50f67:supabase/migrations/<filename>`, independent section extraction, exact normalized-text comparisons, `rg`, and `Get-FileHash`. The generator was inspected without running it or rewriting its output.

All four bundled migration bodies exactly match the pushed migration bodies after removing only their original top-level BEGIN/COMMIT statements and trimming outer whitespace. Timestamp ordering is preserved. Original migrations were not edited by the reviewer; the dirty root workspace was preserved.

The setup file has one outer BEGIN and COMMIT, with lock timeout, preflight, all four bodies, and structural verification before COMMIT. It requires profiles, teams, private schema and the approved-membership helper, and stops if any of the five Wooly relation names exists. A later failure aborts the transaction; the instructions explicitly require ROLLBACK before further queries. Existing or partial installs are directed to inspection and missing migrations rather than deletion or a repeated first-time install.

No support account is inserted by the main bundle. The separate optional support script rejects the unchanged placeholder, casts the supplied UID to UUID, requires both the Authentication user and corresponding website profile, and grants only that chosen profile with idempotent conflict handling. The script establishes account existence; the operator must identify and verify that it is their intended account. Team ownership does not confer website-support authorization.

The guide correctly states that manual SQL Editor execution bypasses CLI migration history, and requires verifying all four migrations before explicitly reconciling their versions on the intended linked project. The bundle does not alter migration history. SQL setup, optional support grant, website deployment and hosting flag activation are clearly separate. No model training, answer seed or AI key is needed for the shipped deterministic help catalog.

## Limits and gates

No database or browser tools were used, no remote changes were requested or performed, and no heavy suite was needed for packaging. Live SQL execution, two-tenant/anonymous RLS tests, and rollback behavior remain unexecuted because the local database runtime is unavailable. Exact migration-body preservation and structural checks are meaningful packaging evidence but do not prove live account isolation. Browser acceptance remains unavailable under the existing restriction.

Reused code-review, security-review, engineering-gates and completion-mandate guidance; loaded db-migration-discipline and supabase-rls-boundaries for this SQL handoff. Product artifacts and migration originals were not modified by this reviewer. Coordinator owns ticket status and any remaining operational verification.
