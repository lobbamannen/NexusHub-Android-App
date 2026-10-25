# Economy Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify existing and future receipt articles deterministically, let Robin edit the shared catalog inside NexusHub, and show truthful category totals per salary period.

**Architecture:** Purchases remain solely in period JSON. Two new central catalog JSON files describe category/group hierarchy and recognized product aliases. A shared pure-JS classifier generates read-time analytics, while the existing GitHub/SHA-protected economy API writes catalog edits and the app exposes analysis and catalog subpages.

**Tech Stack:** React 19, TypeScript, Node 22 `node:test`, Vite, GitHub Contents API, Android WebView, existing offline outbox.

**Spec:** `docs/superpowers/specs/2026-10-25-economy-intelligence-design.md`

## Global Constraints
- No new paid service, backend, OCR, secrets, or changes to archived Site repos.
- A receipt is registered once, in its period file; catalog must never duplicate sales or prices.
- Historical receipt data and budget values are not to be modified.
- Monetary values are summed in integer öre; uncertain discounts and missing receipt breakdowns must remain visible.
- Economy month is payment-to-payment, never assumed to be calendar month or fixed 19th.
- GitHub edits require explicit blob SHA and conflict rejection, including for catalog files.

## Review Focus
- A discount referring to one article reduces the appropriate article category, while ambiguous bonus remains unassigned.
- `Pant` is not silently counted as food nor discarded from purchase reconciliation.
- Unknown products do not accidentally match via substring to branded or larger-package variants.
- Sparse transactions, missing date, and receipts missing article lines don't inflate known category totals.
- Outbox lost-response reconciliation for a catalog edit must not overwrite a concurrent edit.

---

### Task 1: Classification and aggregation engine

**Files:** Create `lib/economy-intelligence.mjs`, `tests/economy-intelligence.test.mjs`.

**Interfaces:** `normalizeReceiptName(name)`, `classifyReceiptArticle(article,catalog,products,previous?)`, `summarizeEconomyPeriod(file,catalog,products)`; all pure and returning traceable category/group/status detail.

- [ ] Write fixture tests for aliases, legacy labels, distinct package sizes, discounts, pant, missing articles, paid-period grouping and all reconciliation totals.
- [ ] Run `node --test tests/economy-intelligence.test.mjs`; observe expected missing-module failure.
- [ ] Implement pure functions to pass tests without external services.
- [ ] Run targeted and existing Node tests, then commit.

### Task 2: Catalog data seeded from 156 lines

**Files:** Create `Databas/Ekonomi/Katalog/kategorier.json`, `.../produkter.json` in the GitHub database (not app repo), update `Databas/Ekonomi/README.md`.

**Interfaces:** `kategorier.json`: `{schema_version:1,categories:[{id,name}],groups:[{id,name,category_id}],legacy_category_map:{[legacy]:group_id}}`. `produkter.json`: `{schema_version:1,products:[{id,name,group_id,aliases:[...]}]}`.

- [ ] Review unique category labels and real repeated products; seed conservative groups, no invented exact brand/size.
- [ ] Ensure legacy mappings cover all 47 unique historic labels, including negative/pant handling.
- [ ] Verify JSON schema and load with classifier; create two files through GitHub and verify SHA.

### Task 3: GitHub catalog read/edit and reconciliation

**Files:** Modify `app/api/economy/route.ts`, `lib/github-inbox.mjs`, `platform/outbox.ts`, test in `tests/economy-api.test.mjs`.

**Interfaces:** GET `/api/economy` returns `files` plus `catalog` containing both SHA-stamped catalog documents. POST `{path,expectedSha,action:'upsert',entry,kind}` updates a category, group, or product via checked mutator; no arbitrary file replacement.

- [ ] Write failing tests for schema guards, duplicate IDs/aliases, valid upsert and stale SHA handling.
- [ ] Implement strict allowed paths and fixed-scope writer; reject unexpected fields and conflicting associations.
- [ ] Extend offline reconciliation to check persisted catalog fields against requested edit before acknowledging a lost response.
- [ ] Run targeted, suite and TypeScript checks; commit.

### Task 4: NexusHub analysis and catalog subpages

**Files:** Create `app/economy-insights.tsx`, `app/economy-intelligence.css`; modify `app/economy.tsx` and optionally `app/economy.css`.

**Interfaces:** Economy overview has Register, Analys, Kategorier & produkter links. Insights receives GitHub snapshot and renders actual period analysis. Catalog editor changes category, group and recognized alias through POST and updates the in-memory snapshot.

- [ ] Add behavior tests for presentational analysis contracts and mutation payloads, verify failure before implementation.
- [ ] Implement distinct subpages, native-back behavior, cached-read warning and unknown-product review; preserve black/green theme.
- [ ] Run `npm run check`, `npm run build`, relevant tests; commit.

### Task 5: Documentation, release, and phone handoff

**Files:** Update `README.md`, `docs/verification.md`, `Databas/Ekonomi/README.md` (no historic data edits).

- [ ] Document one-write receipt contract, safe product corrections, period boundaries and non-verifiable cases.
- [ ] Run full Node test suite, `npm run check`, `npm run build`, `npm run check:design`.
- [ ] Push changed app files through authorized GitHub workflow, confirm fetched SHAs, trigger/observe signed APK workflow and release.
- [ ] Report verified functions and items that can only be checked on Robin's phone.
