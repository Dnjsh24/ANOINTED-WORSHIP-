# Transparent purple browser favicon

User reported browser-tab icon had a black square and incorrect-looking color. Existing favicon was padded on an opaque dark background. Browser icons now derive directly from established SS SVG (#8b5cf6 and #a78bfa), with no background and true alpha. New v2 URLs bust browser favicon caches, SVG sizes=any serves crisp modern icons, ICO contains 16/32/48 PNG entries and existing browser icon paths are compatibly replaced. PWA/Apple install icons preserved.

Reproducible generator scripts/generate-browser-favicons.mjs. Metadata references versioned assets; public service-worker cache moves v3 to v4 and caches new public icon URLs. Authenticated caching exclusions unchanged; no auth/data/env/dependency changes. Scope only favicon, metadata and cache refresh.

Scoped strict lint, service-worker syntax and whitespace pass. Independent Laura verifies valid 3-entry ICO, transparent corners, exact palette, SVG parity and unchanged PWA/Apple assets. PNG16/32 checks independently confirm alpha-zero corners and exact opaque brand colors; production dependency audit zero vulnerabilities. Packet SHA25651b595e637ce2e5f95970d3aaf91ac049db2c9795bdbc9049ed5d725c4a362ef. Build/browser/publish settlement pending. Previous brand/notification gates retained; no full unrelated suites for reversible asset change. Effective settings/usage unavailable.
