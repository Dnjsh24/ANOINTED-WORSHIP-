# WOOLY-22: dismiss the welcome panel

Choosing **Maybe later** closes Wooly's welcome panel. It does not open the Help panel. The idle Wooly launcher remains available to open Help later.

Only the welcome button's handler changes, from `openHelp` to `setPanel("closed")`. Existing dialog cleanup restores page focus and removes its focus trap and scroll lock. The invitation remains offered; dismissal does not mark a tour completed or skipped. Other controls and stored progress are unchanged.

## Evidence

- Coordinator provider regressions: 32/32 pass, including dismissal, focus restoration, unchanged offered checkpoint and reopening Help from the launcher. `output/wooly-maybe-later/tests.log`.
- Scoped ESLint: pass, zero warnings. Current-source TypeScript: pass using `.tmp/wooly/tsconfig.json`. `output/wooly-maybe-later/lint.log` and `types.log`.
- Independent review: Laura approved the matching two-file candidate, verified both hashes and independently passed the targeted dismissal regression (1/1; 31 intentionally skipped). `output/wooly-maybe-later/review.md` and `independent-tests.log`. Final coordinator source hash audit has zero mismatches.
- Browser acceptance remains unavailable under the existing browser restriction. DOM interaction/focus tests are the meaningful available alternative.

The snapshot files in `output/wooly-maybe-later/` preserve the immediate pre-fix source. No routes, imports, styles, assets, dependencies, database operations or authorization boundaries change. Full build/coverage/database checks are not repeated for this event-handler-only fix; previous evidence and global blockers remain documented in `WOOLY-EXPANDED-HELP.md`. No remote or desktop change is included. Standard lane; applicable engineering-gates and completion-mandate were reviewed. Final ticket remains Review pending permitted physical acceptance.
