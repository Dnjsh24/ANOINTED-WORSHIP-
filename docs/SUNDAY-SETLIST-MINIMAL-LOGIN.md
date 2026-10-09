# Logo-only minimal login

Final status: Done, completed 1/1. Laura independently approved final source and all three responsive screenshots without findings. Local preview updated; no blockers or remaining work.

BRAND-08. Applies user-selected Minimal Studio mockup with requested wordmark/Ministry Planning removal. /login uses existing transparent SS icon at 96px, centered above Welcome Back. Card removed; white Google button with dark text, 48px minimum height and explicit violet keyboard focus. Supporting line and readable footer retained. Homepage and branding assets unchanged.

Coordinator owns login source; Laura independently reviews. Auth handler and status logic preserved, confirmed byte-equivalent auth handler to HEAD. Scoped lint zero errors, three unchanged navigation warnings; whitespace passes. Production demo build including TypeScript passes. Targeted desktop 1280x800, Pixel 7 and narrow 320x640 browser checks pass 3/3: logo load/dimensions/order, no Ministry Planning descriptor, no overflow, white button >=48px, keyboard focus outline and error status. Screenshots testing/sunday-setlist-login-minimal-desktop.png, -mobile.png and -narrow.png. Source SHA256 dab49bf2ec9aec8e789bba1932a45caacbb19304be22368a17b538c3b6745467.

Standard low-risk UI lane. Relevant gates: acceptance, source review, accessible alt/heading/focus/contrast, build/types and affected responsive checks. No new tests for this reversible styling change; unrelated full unit/coverage/security/database checks N/A. No data/auth boundary/schema/storage/dependency/environment/offline/service changes. No push/deploy. Worker effective settings and usage telemetry unavailable.
