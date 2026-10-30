# Connected NexusHub — verification and operational scope

Implemented ideas 2/26 (one Connections/Graph model), 3 (Guardian), 16 (read-only Cortex training archive), 25 (deterministic Command). Semantic search and a generic automation engine remain outside this change.

## Data and persistence
- Connections derive from the completed local Databas snapshot. Ordinary documents group exact matching stems across formats; Markdown is preferred for extraction. Active knowledge chunks retain their topic membership. News and ideas are read from their actual JSON records. Film and series items have stable per-title identities.
- Explicit document references and shared source URLs are labelled as such. Common title/tag words produce suggestions only. No AI service is called. PDF/Word-only content is represented by metadata; text inside those originals is not claimed to have been examined.
- User relations are saved to the fixed `System/NexusHub/connections.json` register with expected SHA. Revocation preserves the record and its history; unrelated source files are never rewritten. Corrupt registers are reported rather than silently repaired.
- Training reads only `Cortex/Data/Dagsloggar/YYYY/YYYY-MM.json`, completed workouts, original exercise order, recorded volume and journal text. Unknown fields remain unknown. Historic `count` fields are displayed as recorded because their meaning varies between older grouped sets and newer set indices. Cortex remains the writer.
- Index caches include source path and SHA. No successful index is returned after a snapshot changes during reading. Global training filtering reports progress and incomplete months.
- Deleted ideas are excluded from daily counts by existence in the actual tree, while permanent number assignments remain intact. Confirmed deletion updates home state and wakes the native widget activity bridge.

## Automated and visual checks
- TypeScript, design provenance check and Vite production build passed.
- 154 current Android domain/regression tests passed, including normalization, relation identity, deletion counts, snapshot boundaries and Guardian's current poster checks.
- Independent GitHub Chromium run `41009891754` passed production component rendering and interactions at 320, 412 and 900 pixels: calendar selection/month changes/filter reset; graph navigation; relation creation; Guardian status; Command navigation. All twelve screenshots were downloaded and representative phone screenshots inspected by the author. No horizontal page overflow or browser runtime errors were observed.
- Independent code review found six material defects: multi-format IDs, path-dependent cache keys, stale poster health, final media snapshot races, corrupt relation records and collapsed relation identities. All were corrected, with regression coverage. No deferred reviewer findings.
- The signed APK workflow also runs the new domain/service tests and browser checks before signing and release.

## Remaining real-device verification
No physical Samsung was controlled in this environment. After installing the signed update over the existing app, verify cold start, Android Back, offline history after full sync, actual Cortex workout details, graph indexing on the real database, and create/delete a test idea while observing both home and native widget. Browser tests use explicit synthetic data, not a claimed end-to-end phone test.
