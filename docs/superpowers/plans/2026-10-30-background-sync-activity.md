# Background saves and activity history

Goal: Save incoming content durably before returning to the UI, finish GitHub intake uploads without a visible Activity, continue active replica/user-save work across app switching, and provide a persistent searchable activity history of real operations.

Architecture: Native WorkManager intake jobs own uploads staged in private files. Existing TypeScript domain routes and SHA checks remain the sole writers for other modules; a bounded foreground data-sync lease keeps in-flight WebView operations alive during app switching. Native activity SQLite journal accepts immutable, deduplicated structured events from native jobs and the web application, with a durable browser fallback. The activity viewer is reachable from the existing menu.

Constraints: No page-view/click tracking; no credentials or original document bodies in activity records; no automatic replay of unrelated editor drafts; no guessed remote success; no removal of originals on failed delivery. Explicit Save authorizes its exact operation to continue in background. Existing registration formats remain unchanged. History begins with this update, without invented past actions.

Work:
- [x] Native persisted intake queue, GitHub verification/reconciliation and retry; bounded active-work service and bridge.
- [x] Persistent activity journal, paging/filter/search/export and UI.
- [x] Fast local pasted-text save, native receipt reconciliation, background lifetime around active writes/replica, semantic mutation/change logging.
- [ ] Tests for interruption, duplicate delivery, conflict, secrets, deletion, offline, pagination and visibility; build, visual review, independent review and publish.

Review focus: response lost after commit; delete while upload queued; same object edited twice; untrusted metadata/token leakage; historical snapshot mistaken for a deletion. Test these in their owning components.

Execution is already authorized by Robin's request to implement both ideas together; no additional planning approval is needed.

Verification checkpoint: 177 required Node tests, TypeScript check, original-design guard and Vite build pass locally. Broad legacy-suite failures were reproduced on the unchanged baseline; required workflow suite includes the affected tests. Native tests/lint/signing and feature screenshots are gated by the APK workflow. Native automatic weather/release/battery results also enter the journal.
