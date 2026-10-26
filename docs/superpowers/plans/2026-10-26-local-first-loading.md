# Android Local-first Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display complete verified local Databas and ChatGPT-Plugin replicas immediately while retaining GitHub checks for new versions and safe writes.

**Architecture:** Keep the independent replica synchronizer as the freshness channel. Add derived local read projections from current verified mirror versions; have UI GETs prefer those projections while live API functions remain the authoritative path for writes and explicit inspections. Limit redundant network refresh and reuse binary images without changing visual design.

**Tech Stack:** React 19, TypeScript, Vite, IndexedDB, sql.js, Android WebView, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-26-local-first-loading-design.md`

## Global Constraints

- Preserve version-checked GitHub writes and pending/conflict reconciliation.
- Never display unverified corrupt bytes as verified current content; fallback to existing remote read when necessary.
- No visual redesign, dependency changes, new backend, or destructive cache migrations.
- The live GitHub replica check must keep running in the background; network failure cannot erase a good local copy.

## Review Focus

- Empty/incomplete mirror should use the established online behavior.
- An altered GitHub commit must update local projections after the new bytes are verified, without stale return after edits.
- Saved draft + background refresh cannot overwrite user input.
- Two media cards using the same poster must share loading safely and recover on unmount.
- Historical activity and watch native sync must retain trustworthy online verification.

---

### Task 1: Verified read-only mirror projections

**Files:** Create `lib/replica-read.mjs`, modify `platform/local-read-seed.ts`, `platform/api.ts`; tests `tests/replica-read.test.mjs`.

**Interfaces:** `createReplicaReader({manifest,lookup,readBytes,verify})` resolves current-version bytes with strict SHA; `seedLocalApi(path,reader)` produces validated GET envelopes. The UI read path never changes a GitHub writer.

- [ ] Write test for current blob reads, missing/corrupt/incomplete mirror and stale SHA rejection; run RED.
- [ ] Implement exact-version local reader; run GREEN.
- [ ] Add tests for local projections of films, series, stories, bookmarks, todos, ideas, plans, economy, attachment lists and plugin catalog; run RED.
- [ ] Implement only supported projections and durable response preference; fallback to live routes when complete data cannot be derived. Run GREEN and typecheck.
- [ ] Commit tested task.

### Task 2: Documents, dashboard, and posters from the replica

**Files:** Modify `lib/github.ts`, `app/api/posters/route.ts`, `platform/api.ts`, optional local projection module; tests `tests/local-documents-and-posters.test.mjs`.

**Interfaces:** `localMirrorDocument(repo,path)` verifies local original before any network; poster index construction uses local manifest/catalog when present and preserves GitHub fallback.

- [ ] Test local-first document, file index and poster lookup with GitHub unavailable; run RED.
- [ ] Implement verified local default while preserving explicit live GitHub inspection and guarded write behavior. Run GREEN.
- [ ] Confirm story and plugin metadata and original image serving preserve existing response contracts.
- [ ] Commit tested task.

### Task 3: One background freshness coordinator

**Files:** Modify `platform/replica-sync.ts`, `platform/api.ts`, `lib/local-first.mjs`, `app/portal.tsx`, optional `platform/watch-sync.ts`; tests `tests/replica-refresh.test.mjs` and existing `tests/replica-sync.test.mjs`, `tests/local-first-recent.test.mjs`.

**Interfaces:** Changed commit invalidates only verified local view projections and notifies consumers after bytes have been saved; per-view cached reads do not launch redundant repo-wide fetches when a complete mirror already supplies truth.

- [ ] Test that unchanged commits cause no forced nine-endpoint wave, changed commits publish data after verification, and explicit reload/write keep remote checks. Run RED.
- [ ] Implement revision-aware local invalidation and scoped refresh. Run GREEN.
- [ ] Verify native watch and calendar correctness and no loops from `nexus-github-changed`.
- [ ] Commit tested task.

### Task 4: Image reuse and responsive page preparation

**Files:** Modify `platform/resources.tsx`, `components/repository-poster.tsx`, possibly `lib/image-cache.mjs`; tests `tests/image-cache.test.mjs` and existing poster tests.

**Interfaces:** Concurrent identical image URLs share work and keep processed images temporarily in a bounded memory cache; current page can enqueue offscreen assets with priority to visible assets.

- [ ] Test de-duplicated concurrent requests, released/reused URLs, bounded eviction, failure retry and changed revisions. Run RED.
- [ ] Implement image session cache and priority loading, preserving exact existing appearance and fallback icons. Run GREEN.
- [ ] Verify component cleanup and latest-revision invalidation.
- [ ] Commit tested task.

### Task 5: Remaining modules, regressions and handoff

**Files:** `components/watch/ReleaseWatch.tsx`, `components/home/DailyActivity.tsx`, any remaining local-read consumers, `docs/verification.md`; targeted tests.

**Interfaces:** Visible watch/activity data can show the last verified copy immediately while fresh native/historical checks run independently; explicit refresh still reaches GitHub.

- [ ] Test remaining cold-start and offline reads; run RED, implement and GREEN.
- [ ] Run `node --test tests/*.test.mjs`, `npm run check`, `npm run check:design`, and `npm run build`, examine output.
- [ ] Review changed files for invalid security shortcuts and accidental design changes; document exactly what was verified.
- [ ] Commit and prepare branch for review; do not merge or publish an APK without separate checks.
