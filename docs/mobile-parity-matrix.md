# Website → native parity matrix

The website is the canonical product contract. Native adaptations preserve every user-visible action, state, permission check, and content field while using tabs, sheets, lists, and safe-area-aware forms.

| Web capability / route | Native equivalent | Status | Runtime verification |
| --- | --- | --- | --- |
| Auth, team join, pending membership | `/`, `/login`, `/teams/join`, `/pending` | Implemented | mobile unit tests |
| Dashboard, notifications, announcements, reminders | `/dashboard`, `/announcements`, `/reminders` | Core implemented | web export + mobile typecheck |
| Songs, soft deletion and recovery | `/songs`, `/songs/[id]`, `/songs/trash` | Implemented | mobile typecheck |
| Setlists, songs, stage mode | `/setlists`, `/setlists/[id]`, `/stage` | Core implemented | mobile typecheck |
| Setlist templates | `/setlists/templates` | Implemented | mobile typecheck |
| Events, attendance, event edit | `/events`, `/events/[id]`, `/events/[id]/edit` | Core implemented | mobile typecheck |
| Messages and read receipts | `/messages`, `/messages/[id]` | Core implemented | mobile unit tests |
| Members and request review | `/members`, `/members/requests` | Implemented | mobile typecheck |
| Analytics | `/analytics` | Implemented | mobile typecheck |
| Dance charts | `/dance` | Route consolidation pending | static audit |
| Presenter, projector, confidence, remote | `/presenter`, setlist presentation routes | Pending | device test required |
| Offline mutation outbox and conflict handling | shared data layer | Pending | device test required |
| Universal/App Links, push-token lifecycle | app configuration + notification layer | In progress | device test required |
| External display module | native iOS/Android module | Pending | physical-display test required |

Every completed item still requires the states below before it can be marked runtime-verified on iOS and Android: populated, loading, empty, error, offline, unauthorized, dynamic text, keyboard open, reduced motion, and screen-reader focus.
