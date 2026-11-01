# Idé 35 Remaining Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Tasks are executed without further user checkpoints; user explicitly requested all fixes.

**Goal:** Close every outstanding finding and record verified decisions for all 31 originals.
**Architecture:** Repair existing receipt, replica, intake and model protocols. Use shared contracts rather than parallel new systems.
**Tech Stack:** TypeScript/React/IndexedDB/sql.js, Kotlin/WorkManager, C++/llama.cpp, GitHub Actions.
**Spec:** docs/superpowers/specs/2026-11-01-idea35-completion-design.md

## Global Constraints
- Preserve original data, pending work, receipts, deletion markers, activity history, UI design and signing identity.
- No automatic model reruns after process death; no unscoped late cancellation; no generic receipt TTL.
- All 31 points receive implemented fixes or a justified verified decision; physical phone/NPU cannot be claimed tested here.
- Use tests that execute production behavior; classify historical failures individually, no blanket deletion.

## Review Focus
- Remote commit before local crash: full response+affected read resources survive and replay once.
- Conflicting editor operation completes after identity changes: no wrong-target state or writes.
- Cancel during hash/load and import on destroyed Activity: no lost stop or concurrent model ownership.
- Import runs out of disk during metadata write: discoverable state and preserved originals.
- Repair/GC during pinned reads: live snapshots retain needed bytes and obsolete markers terminate.

### Task 1: Durable write and replica contracts
Files: platform/outbox.ts, platform/api.ts, lib/replica-projections.mjs, platform/replica-sync.ts, tests receipt/API/replica behavior.
- [x] Reproduce incomplete receipt and lost media fence using actual code.
- [x] Persist complete validated route response+affected resources; await startup restore; recover old receipts via safe read, never fabricated partial success. Include direct todos/deletion recovery as appropriate without losing response contracts.
- [x] Pin Plugins reads; handle obsolete repair markers safely.
- [x] Test original repros, lost responses, restart, concurrent publication; commit and review.

### Task 2: Native intake and model ownership
Files: IncomingShareStore.kt, BackgroundIntake*.kt, ModelRunCoordinator.kt, MainActivity.kt, IntelligenceRuntime.kt, runtime-utils.h, llama-android-accelerated.cpp; native tests.
- [x] Reproduce stop-prefix, early cancellation, import bypass and incomplete intake metadata.
- [x] Hold model ownership across import/test/cleanup; preserve cancellation intent across reset/load; safe release on failure.
- [x] Journal receipt before copying, disk budget+partial failure recovery; preserve originals and discover package without final metadata. No helfils Base64.
- [x] Flush legitimate final stop-prefix, keep complete markers hidden; test native helpers and intake fault injection; commit/review.

### Task 3: Identity-safe editors and prompt/modal contracts
Files: ReleaseWatch.tsx, NexusIntelligence.tsx, RetrievalLab.tsx, shared helpers/tests.
- [x] Reproduce delayed conflict response across identities, long assistant turn, initial Shift+Tab, actual source-metric mismatch.
- [x] Guard every async continuation with identity/generation; pin save target; keep stable draft per identity.
- [x] Omit oversized complete history turns and honor actual native context contract without deleting visible history; fix modal focus/back/unsaved-close and evidence diagnostics.
- [x] Persist chat acknowledgement only after visible transcript durable; test navigation/recovery; commit/review.

### Task 4: Paths, caches, tests and delivery completeness
Files: lib/connections.mjs, UI server scripts/helpers, derived cache namespaces, tests runners/classification, README/docs.
- [x] JSON repository paths distinct from Markdown-relative links; test all actual roots and traversal.
- [x] Every UI script uses isolated strict-port server+identity and guaranteed cleanup.
- [x] Bound only reconstructible inactive derived caches; protect active snapshots. Code splitting remains deferred absent physical measured benefit. Readability changes limited to touched flows.
- [x] Classify every old failure with behavior replacement as needed; make current suite runnable without giant assertion; document full31 decisions and test evidence.
- [ ] Final delivery: local suite/typecheck/design/build/Python/C++ pass; independent review and PR5 complete. Await signed Android/Robolectric and browser CI, merge main, verify actual release.

