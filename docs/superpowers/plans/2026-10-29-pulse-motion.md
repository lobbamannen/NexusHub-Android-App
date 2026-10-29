# Nexus Pulse and Motion Implementation Plan

**Goal:** Implement approved ideas 1, 23 and 24 in the Android app.
**Architecture:** Shared daily counters, a compact contextual Pulse surface, a visibility-aware SVG greeting border, and progressive navigation/selected-image transitions using existing navigation and guards.
**Tech Stack:** Existing React, CSS, SVG and browser View Transitions, without new runtime dependencies.
**Spec:** User-approved design in this conversation: Pulse below greeting, only positive counters, at most two useful actions; blue/violet perimeter light at 16–20 seconds; short module, poster, panel and reverse transitions.

## Global Constraints
- Preserve existing modules, palettes, dirty guards, native Back, scroll restoration and persistent data paths.
- No unsolicited permission prompts, carousel or AI requirement.
- Pause decoration offscreen/background; honor reduced motion.
- Calendar data stays on device, respects existing source filters; do not invent availability or event dates.
- Publish to main, run checks, then set original idea statuses to completed, preserving other fields.

## Review Focus
- Rapid navigation and unsupported transitions must still execute an update exactly once.
- Recurring/overnight and all-day calendar events respect Stockholm dates and exclusive ends.
- Revoked calendar permission clears phone events.
- Repeated poster instances never create duplicate shared names.
- Closed dialogs, zero activity and offscreen decorations leave no ghost content or timers.

## Tasks
1. Add tested pure Pulse selection and safe motion lifecycle helpers. Cover zeros, stale dates, future/ongoing events, grouping, permission/data absence, fallback and interruption.
2. Add Pulse component, selected-source calendar reader, compact counters/actions, and SVG welcome frame; preserve home layout. Add isolated UI fixture for real-browser QA.
3. Integrate guarded navigation, selected poster/story transitions and panel motion. Verify reverse navigation and existing contracts.
4. Run TypeScript, original design checks, workflow domain tests, web build and available browser QA; review full diff, publish atomic source commit, read back main. Record verification limits. Then update three original ideas with SHA protection and read back statuses. Do not await/download APK.
