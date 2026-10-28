# Battery Night Pause Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Configurable two-sided 20:00–06:00 battery pause.
**Architecture:** Shared wall-clock policy and versioned config, native settings, guarded workers/listeners, delayed boundary WorkManager jobs.
**Tech Stack:** Kotlin/Java, Android WorkManager, Wear Data Layer.
**Spec:** docs/superpowers/specs/2026-10-28-battery-night-pause-design.md

## Global Constraints
- Enabled default 20:00 inclusive–06:00 exclusive; system local time.
- No measurement, requests, battery-flow telemetry or watch journal transfer in pause; explicit config/ack allowed.
- Preserve cached values, signing identity, current app data and existing design.

## Review Focus
- Boot/update and work queued before pause cannot bypass guards.
- Timezone/time changes and DST recompute boundaries without exact alarms.
- Offline/old watch cannot be shown as configured without acknowledgement.
- Stale/invalid configs cannot overwrite newer watch settings.
- Widget refresh and settings display cannot cause repeated requests.

### Task 1: shared pause/config
- [ ] Write and run failing real Java wall-clock tests with java compiler; add JUnit config tests.
- [ ] Implement BatteryQuietHours and BatteryConfiguration, testing bounds, daytime/overnight, DST, invalid config and ordered revision.
- [ ] Run core tests, commit.

### Task 2: both runtimes/settings
- [ ] Guard measurement, request, retry and journal entry points; cancel periodic work in pause and enqueue next transition.
- [ ] Add config-only worker and matching watch acknowledgement; persist settings independently of connectivity.
- [ ] Add native pause controls/status, widget and watch labels; handle boot/time/timezone changes.
- [ ] Add runtime tests for skipped work and config acknowledgement; run Android tests/lint/build in CI.

### Task 3: review/release
- [ ] Update installation and verification docs; include phone-only GeminiMan installation already tested by Robin.
- [ ] Run frontend checks, shared tests and Android CI; fresh independent review and address material findings.
- [ ] Publish both signed APKs, verify release assets/signatures; report physical overnight validation still pending.
