# Messages fixture browser benchmark — 2026-10-07

The actual Messages page loaders, first-page server action and React components were compared against baseline `0cdbfc5ee131172e30033ca14461c79602b39ece`. The fixture contains 50 members, 20 channels and 10,000 messages. The comparison measures synthetic fixture loading, serialized props transfer and component rendering. Authentication, the Next.js shell/navigation, realtime and server-action HTTP transport use local adapters. It does not measure complete Next.js route, production database or deployed latency.

The same desktop and phone contexts were used for both candidates. Each context excluded one warmup pair, recorded seven measured pairs, and alternated candidate order. Desktop uses a 1280×800 viewport without throttling. Phone uses Pixel 7 emulation, fourfold CPU throttling, 150 ms network latency and 8 Mbps download/upload throughput.

| Median metric | Before | After | Improvement |
| --- | --- | --- | --- |
| Desktop inbox | 1299.10 ms | 44.00 ms | 96.6% |
| Desktop first conversation journey | 1563.50 ms | 117.70 ms | 92.5% |
| Phone inbox | 7316.10 ms | 1141.40 ms | 84.4% |
| Phone first conversation journey | 8557.80 ms | 1521.20 ms | 82.2% |

The first conversation journey adds each trial's inbox commit time and click-to-latest-message visibility time before taking the median. Inbox commit time is a React effect timestamp after rendering, not a browser paint metric. Both inbox and journey medians exceeded the 25% target on both profiles.

Initial props decreased from 5,074,553 to 122,650 bytes. The baseline includes all 10,000 messages and 500 in the selected channel; the candidate inbox includes no history. The actual `loadChannelMessagesAction` verifies membership against the local HTTP fixture and fetches 51 rows, returning 50 messages, `hasMore=true` and a timestamp/ID cursor. The selected-history response is 23,805 bytes. The harness asserts those bounds, cursor availability, latest-message visibility and absence of browser runtime errors.

Reproduction:

```powershell
$env:ESBUILD_MODULE_PATH = "$env:TEMP/anointed-chart-preview/node_modules/esbuild/lib/main.js"
node scripts/benchmark-messages-browser.mjs
node node_modules/eslint/bin/eslint.js scripts/benchmark-messages-browser.mjs --max-warnings 0
```

All commands passed. The final seven-pair run used Node 22.23.3 and the final build's `e8b9b57349f7725e.css`, SHA-256 `723946d93dfe8ce4c45136787774e58f931cfa279445e03410b59ec26e58f4b3`. It replaces the earlier stylesheet measurement; application and benchmark source hashes remain unchanged. Esbuild is an existing temporary tooling installation, not a new project dependency. A production `.next/static/css` stylesheet is required. The local fixture server and Chromium are closed after the run; temporary source bundles/results remain available for inspection.

Laura independently reviewed the affected script and accepted its synthetic scope, action fidelity, selected-history assertions, filtering, sampling and candidate identity. `node --check scripts/benchmark-messages-browser.mjs` passed independently. Reviewed script Git blob: `3d536734da03b195978692714caac5fa294ae543`. The [raw results](T21-MESSAGES-BROWSER-BENCHMARK-2026-10-07.json) preserve full baseline/HEAD IDs, source SHA-256 hashes, query counts, payload sizes and every measured sample.

This establishes the scoped Messages fixture result. The [Songs/Setlists browser report](T21-LISTINGS-BROWSER-BENCHMARK-2026-10-07.md) records the listing measurements. [Local application migration replay](T21-MIGRATION-CHAIN-2026-10-07.md) passed; actual provider services and live project inspection remain open T21 gates. SQL cardinality fixtures for 1,000 songs and 500 setlists are separate evidence.
