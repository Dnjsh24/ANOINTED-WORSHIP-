# Website route and history audit

Candidate: integrated usage commit `830c37a` plus the coordinator's frontend changes. Website scope only; desktop application modules were not modified.

## Findings repaired

- `/messages` selected and marked the first conversation read without a user choosing it. The inbox now has no default selection; explicit `?channel=` URLs open only an available chat. Browser Back/Forward restores the list or selected channel. The Back to chats control replaces the conversation entry, so subsequent Back does not reopen the closed chat. Conversation views reset drafts, replies, schedules and attachment previews when the selected URL changes. Missing chats do not fall back to another channel.
- Messages contained a pinned link to the sample `/setlists/sunday-service` with a fictional date. It now links to the team's setlist list with accurate text.
- Worship Remote QR cleanup used `history.replaceState(null, ...)`, discarding Next.js history state. It preserves `window.history.state` while removing the pairing fragment.
- Phone setlist song controls forced horizontal overflow. The responsive row puts controls below the title and constrains the grid column. This also repairs phone access to the Add Song link during route journeys.

Specific links labeled Back to Songs, Back to Team, Back to Charts, and Back to Library retain their stated destinations. Browser Back preserves the actual origin. No generic router-back implementation, external return URL, or new authorization bypass was introduced. Existing authentication return-path allowlisting remains intact.

## Route matrix

| Surface | Routes inspected | Browser evidence |
| --- | --- | --- |
| Home | `/dashboard`, `/announcements`, `/reminders` | Home-to-announcements/reminders Back/Forward |
| Songs | `/songs`, `/songs/new`, `/songs/trash`, `/songs/[id]`, `/songs/[id]/edit` | Home-to-song, library-to-new, detail-to-edit Back/Forward |
| Setlists | `/setlists`, `/setlists/new`, `/setlists/templates`, `/setlists/[id]`, `/setlists/[id]/edit`, `/setlists/[id]/add-song` | Detail-to-edit/add-song Back/Forward; new/edit mouse and actual touch song dragging |
| Events | `/events`, `/events/new`, `/events/[id]`, `/events/[id]/edit` | List-to-new and detail-to-edit Back/Forward |
| Team | `/members`, `/members/[id]`, `/members/invite`, `/members/requests` | Team-to-invite and member-detail-to-team Back/Forward |
| Messages | `/messages`, `/messages?channel=...` | Inbox/select/Back/Forward/list control/invalid chat on desktop and phone |
| Analytics and account | `/analytics`, `/profile`, `/admin/settings` | Source review and route smoke coverage |
| Onboarding | `/`, `/login`, `/teams`, `/teams/new`, `/teams/join`, `/pending` | Source review and route smoke coverage; auth allowlist unit checks |
| Dance | `/dance`, `/dance/[id]`, `/dance/[id]/edit` | Source review; list route smoke. Authenticated chart fixtures unavailable |
| Presentation | `/presenter`, `/worship-remote`, `/worship-remote/session/[sessionId]`, `/setlists/[id]/presenter`, `/setlists/[id]/projector`, `/setlists/[id]/confidence`, `/setlists/[id]/stage`, `/setlists/[id]/remote` | Home-to-remote Back/Forward; pairing/history unit checks; legacy redirects and stage/projector/confidence route smoke |
| Desktop sync | `/sync` | Desktop-only destination; implementation excluded from website scope |

## Checks and limits

`e2e/requested-fixes.spec.ts` covers twelve actual link journeys, each checking destination, Back origin and Forward destination, plus chat selection history, transparent Quick Access icons, and touch/mouse selection in new/edit setlists. The phone project uses its normal Pixel 7 viewport, real Chromium touch events and page auto-scroll. It checks that touch drag activates, the pointer reaches the drop target, selection grows once, and existing IDs remain.

Normal-height phone drag and all twelve actual-link journeys passed. Final production checks passed both 39-route smoke journeys, usage UI and security/accessibility cases. A final six-test affected rerun passed on desktop and phone after the chat-history fix and cancellation test timing correction. Exact results and limits are in `tickets.md` and [the final packet](WEBSITE-FIXES-2026-10-05.md).

Tests force demo mode and block remote Supabase traffic. Live authentication, channel membership updates, paired remote sessions, and private dance records require appropriate authenticated fixtures; these were reviewed in code and relevant unit tests, not fabricated as live browser evidence. Production deployment and native Supabase verification remain separate operator actions.
