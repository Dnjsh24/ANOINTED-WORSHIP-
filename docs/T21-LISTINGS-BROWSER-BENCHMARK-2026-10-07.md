# Listing fixture browser benchmark — 2026-10-07

The actual Songs and Setlists loaders and React clients were compared against baseline `0cdbfc5ee131172e30033ca14461c79602b39ece`. The fixture contains 50 members, 1,000 songs and 500 setlists with four songs each. Supabase queries use a local synthetic HTTP fixture; authentication, Next.js shell/navigation and action transport use adapters. These measurements cover fixture loading, serialized props transfer and rendering, rather than full Next.js route or deployed database latency.

Each profile excludes one warmup pair and records seven measured pairs with alternating candidate order. Desktop uses a 1280×800 viewport without throttling. Phone uses Pixel 7 emulation, fourfold CPU throttling, 150 ms network latency and 8 Mbps download/upload throughput. Times end at the React commit effect, not browser paint.

| Median listing time | Before | After | Improvement |
| --- | --- | --- | --- |
| Songs, desktop | 312.8 ms | 30.4 ms | 90.3% |
| Setlists, desktop | 463.6 ms | 45.8 ms | 90.1% |
| Songs, phone | 2801.4 ms | 1076.7 ms | 61.6% |
| Setlists, phone | 3770.0 ms | 1082.7 ms | 71.3% |

All four measured routes exceed the 25% target. The harness checks actual rendered counts: baseline 1,000 songs/500 setlists versus candidate 50 songs/20 setlists, while preserving exact totals. Literal search for `Song 1000`, beyond the first page, returns one song and its two setlists. The fixture implements filtering, ordering, range and count behavior and includes the selected nested leader profile ID.

Reproduction:

```powershell
$env:ESBUILD_MODULE_PATH = "$env:TEMP/anointed-chart-preview/node_modules/esbuild/lib/main.js"
$env:BENCHMARK_SAMPLES = '7'
node scripts/benchmark-listings-browser.mjs
node node_modules/eslint/bin/eslint.js scripts/benchmark-listings-browser.mjs --max-warnings 0
node --check scripts/benchmark-listings-browser.mjs
```

All commands passed on script SHA-256 `2cf1082c225303245691dd5f56c032f3eeb590400b37e62939d46af75420b305`. The final seven-pair run used Node 22.23.3 and the final build's `e8b9b57349f7725e.css`, SHA-256 `723946d93dfe8ce4c45136787774e58f931cfa279445e03410b59ec26e58f4b3`. It replaces the earlier stylesheet measurement; application and benchmark source hashes remain unchanged. Esbuild uses an existing temporary tooling installation; no project dependency was added. A production `.next/static/css` stylesheet is required. Juan independently reviewed the fixture and identified the missing selected leader profile ID; the accepted script includes that correction. Final review of that delta is recorded in tickets.md.

The [raw results](T21-LISTINGS-BROWSER-BENCHMARK-2026-10-07.json) preserve baseline/HEAD IDs, source and stylesheet hashes, query details, payload sizes and every measured sample. Live performance and Supabase provider behavior remain unverified.
