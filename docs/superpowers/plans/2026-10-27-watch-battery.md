# Watch Battery Implementation Plan

Goal: ship phone widget, Wear companion and PostHog battery diagnostics.
Architecture: shared validated wire model; persistent native phone repository; platform widget; minimal Wear sampler and bounded journal; native settings reachable in NexusHub.
Spec: docs/superpowers/specs/2026-10-27-watch-battery-design.md

Global constraints: exactly two battery rows, stable phone package/signature, no Databas writes, same watch certificate, no background real-time guarantee, opt-in telemetry only, no private identifiers in telemetry.

Review focus: process death/reboot; out-of-order/invalid/future snapshots; multiple watch nodes; consent changes with delayed diagnostics; widget refresh timeout/freshness.

## Task 1: Shared model and telemetry contract
- [ ] Add failing validation/freshness/ordering tests, run RED.
- [ ] Add shared model, strict telemetry types and native-only capture boundary; run GREEN.
## Task 2: Phone and wearable pipeline
- [ ] Add phone durable repository, capability discovery, data listener, unique work, refresh timeout and diagnostic journal.
- [ ] Add Wear module, sampler, listener, scheduler, boot recovery and minimal control screen. Config sync uses persistent DataItem.
## Task 3: Widget and settings
- [ ] Add responsive two-row RemoteViews, icons, progress, native settings and React entry point.
- [ ] Show measured wall-clock time and missing/stale/error states; keep unknown watch row.
## Task 4: Delivery and verification
- [ ] Run JS regression suite, TypeScript/design/build; run both Android unit tests, assemble and lint in CI.
- [ ] Fresh reviewer checks whole diff. Fix material findings.
- [ ] Publish both signed APKs, verify matching certificates and unchanged phone certificate, prepare PostHog dashboard, document honest device-test boundary.
