# NexusHub Weather Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development for native engine; integration inline, then independent review.

**Goal:** Complete weather page, greeting indicator and combined date/weather widget.
**Architecture:** One native repository + atomic cache and WorkManager, shared JSON state exposed to React and RemoteViews widget.
**Tech Stack:** Kotlin, Android WorkManager/RemoteViews, TypeScript React/Vite, existing native bridge.
**Spec:** docs/superpowers/specs/2026-10-28-nexushub-weather-design.md

## Global Constraints
Black widget #000, centered gold signature, date→kalender/weather→vader. No agenda. Preserve original app design and battery/watch behavior. No invented weather, keys or background GPS. SMHI primary, MET fallback, atomic cache and explicit stale/time attribution. Complete approved V1, not a demo.

## Review Focus
Cache cannot cross locations or overwrite a good snapshot with malformed data. Concurrent refreshes share one inflight job; rate limits/cache expiry apply even to manual requests. Sparse/partial daily data and precipitation duration remain truthful. Date midnight/timezone/boot refresh without network. Cold app widget deep-links safely into existing routes. Native/React API contract errors visible, no endless polling.

### Task1 native engine
Files app/src/main/java/.../weather/{WeatherModels,WeatherMath,WeatherRepository,WeatherRuntime}.kt and app/src/test/.../weather/*; tests/fixtures/weather. Own network parsing, validation, astronomy, feels-like, persistent cache, provider failover and schedule. Exact contract in spec. Verify live SMHI/MET fixtures, invalid JSON/sentinel/unit bounds, provider-switch, cache/304/429/Retry-After/location race, solar/polar/DST, no needless refresh. Use test-first. Expose WeatherRuntime.initialize(c), state(c):JSONObject, refresh(c,manual:Boolean=false), setLocation(c,params):JSONObject, search(c,query):JSONArray, foreground(c,active:Boolean), listener:(()->Unit)?. WeatherWidgetProvider.renderAll(c) will be implemented separately; runtime may notify via listener and send explicit app-local broadcast `se.lobbamannen.nexushub.app.WEATHER_CHANGED` to widget class. No edits outside owned files or commits without coordinator instruction.

### Task2 integration and widget
Root integrates native bridge, MainActivity pending destination `nexus.destination` allowlisted vader/kalender, lifecycle, boot/date/time receiver. Build black RemoteViews widget metadata/layout/drawables and adaptive renderer using same WeatherRuntime.state. Build React typed client/shared hook/WeatherGlyph/WeatherPage/HomeWeatherIndicator and scoped styles, add vader route/navigation in portal. Test domain formatting, date/route safety, rendering/interaction and native widget runtime. Respect existing native origin restriction. No changes to watch module. Document source/license/transport policy.

### Task3 verification and publish
Run frontend tests/type/design/build, actual UI screenshots with fixture-marked test harness, Android unit/lint/release build in branch CI, independent full review, address material findings with regression tests. Update README/install/release docs, stable signing and previous APK cert checks, publish main release and verify downloadable assets. Report actual physical widget placement/network/battery checks that remain for Robin. Only phone APK needs installing.
