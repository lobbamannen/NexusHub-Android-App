# Battery widget verification – 2026-10-27

## Scope and implementation
Phone: native two-row RemoteViews widget, durable selected-watch snapshot, background listener/reconciliation, explicit correlated refresh with conditional timeout, dark/black/transparent settings, entry inside NexusHub. Wear: separate signed module, capability advertisement, own battery reader, 15/30/60-minute periodic work, manual requests, bounded local journal. Existing phone package, signing restoration and unrelated data stores retained.

PostHog: existing EU project 280222, NexusHub app filter, native-only battery_flow event, exact battery values, generated snapshot UUID, measurement time and stage/outcome. No PostHog SDK on watch. Current consent epoch enforced again atomically at enqueue; ordered diagnostic dedupe retained across watch selection. Saved insight yKz1xQtu added to dashboard 1058562 and queried: no battery events yet. No synthetic events were injected.

## Executed checks
- TypeScript check: passed.
- Original design guard: 42 protected original/adapted files checked, passed.
- Vite production bundle: passed (existing bundle-size warning).
- Current CI JavaScript suite: 106 tests, 106 passed.
- Broad historical suite: 215 tests, 206 passed, 9 failed. The same nine failures were reproduced on untouched origin/main 65be948: github-inbox and upload-api environment suites; two local-posters tests requiring missing legacy tool paths; three series-ui source-layout assertions; series-watchlist source assertion; source-sync-dynamic legacy Site integrity tooling. They are not battery regressions. The current CI suite excludes these archived/environment-dependent checks.
- Initial Android CI run 49: phone/Wear Kotlin compilation reached unit testing; 25 phone tests, two failures in new snapshot boundary/UUID fixtures. Fixed the two-hour boundary and gave distinct measurements distinct UUIDs without weakening duplicate rejection.
- Android CI run 50: phone unit tests passed; both release APKs assembled and Wear lint passed. Phone lint rejected unguarded access to API-29 Insets fields (the nullable API guard was not sufficient for lint). Moved the entire field access into the API-30 branch; no lint suppression added.
- CI run 51 (40560184278): successful phone and Wear unit tests, both release APKs assembled, both lintRelease tasks passed. apksigner verified both APKs; the scripted guard confirmed equal installed package and signing certificate, also matching the preceding published phone APK. Certificate SHA-256: 7a16fa6a685f8879d7b3eea3e4b29ef9a4092d3d1ba69abe3bcbaeab2a8756b4. The final main release reruns these gates.

## Fresh review
Independent read-only reviewer identified four important issues: two unit assertions; per-instance synchronization; consent epoch race during journal forwarding; unordered/resetting diagnostic dedupe. Fixes: global transaction lock, correlated request-ID compare-and-clear, atomic epoch-qualified telemetry enqueue, persistent ordered generated-ID history. Review also prompted read-failure telemetry without invalid measurement fields and pending/error widget status. Ten-minute clock skew tolerance is deliberate and documented. The signature guard compares phone/watch packages and certificates and, in final workflow, the preceding published phone APK.

## Physical checks remaining
Actual Watch8 Classic installation; real watch→phone Data Layer delivery; LockStar resize/render/taps; AOD separately; reboot/reconnect/Doze/deep sleep; 24–72h energy measurements. Neither CI nor PostHog widget_updated proves the pixels appeared on a Samsung lock screen. These checks require Robin's devices.
