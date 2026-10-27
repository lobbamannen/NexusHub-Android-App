# Watch Battery Implementation Plan

Goal: ship phone widget, Wear companion and PostHog battery diagnostics.
Architecture: shared validated wire model; persistent native phone repository; platform widget; minimal Wear sampler and bounded journal; native settings reachable in NexusHub.
Spec: docs/superpowers/specs/2026-10-27-watch-battery-design.md

Global constraints: exactly two battery rows, stable phone package/signature, no Databas writes, same watch certificate, no background real-time guarantee, opt-in telemetry only, no private identifiers in telemetry.

Review focus: process death/reboot; out-of-order/invalid/future snapshots; multiple watch nodes; consent changes with delayed diagnostics; widget refresh timeout/freshness.

## Task 1: Shared model and telemetry contract
- [x] Add failing validation/freshness/ordering tests, run RED.
- [x] Add shared model, strict telemetry types and native-only capture boundary; run GREEN.
## Task 2: Phone and wearable pipeline
- [x] Add phone durable repository, capability discovery, data listener, unique work, refresh timeout and diagnostic journal.
- [x] Add Wear module, sampler, listener, scheduler, boot recovery and minimal control screen. Config sync uses persistent DataItem.
## Task 3: Widget and settings
- [x] Add responsive two-row RemoteViews, icons, progress, native settings and React entry point.
- [x] Show measured wall-clock time and missing/stale/error states; keep unknown watch row.
## Task 4: Delivery and verification
- [x] Run JS regression suite, TypeScript/design/build. Android unit tests/assemble/lint are required release gates in CI.
- [x] Fresh reviewer checks whole diff. Fix material findings.
- [ ] Publish both signed APKs after CI; matching certificates and unchanged phone certificate are required workflow gates. PostHog view and device-test boundary documented.
