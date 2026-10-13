## Change

Describe the requested fix and the resulting behavior.

## Scope and preservation

- Ticket:
- Fetched main SHA:
- Candidate SHA:
- Exact files allowed for this task:
- Existing behavior preserved (include Analytics when shared layouts/data change):

## Verification

- [ ] Candidate contains current `origin/main`; all conflicts were reviewed.
- [ ] `node scripts/check-change-scope.mjs --files ...` passes in the clean candidate checkout.
- [ ] Every changed line belongs to this task; unrelated work is preserved.
- [ ] Required CI checks pass on the final candidate.
- [ ] Independent review covers the final diff.
- [ ] Production deployment will use the merged `main` SHA, verified on Vercel.

See `docs/GITHUB-SAFE-RELEASES.md`. Do not redeploy an old feature branch to production.
