# Local-first loading with safe GitHub synchronization

## Intent

Make Nexus Hub Android display already-mirrored data and pictures without waiting for repetitive GitHub reads. Preserve GitHub as source of truth and keep version-checked writes, reconciliation, integrity verification and automatic synchronization.

## Constraints

- Full Databas and ChatGPT-Plugin replicas live in IndexedDB via `mirror_versions` and `LocalBucket`.
- GitHub API checks must continue in one background reconciliation path and whenever a write, conflict or explicit fresh inspection requires them.
- Never use an unverified/stale local SHA to overwrite a newer GitHub version.
- UI/design and existing data formats remain unchanged; offline responses must not misrepresent remote freshness.
- Preserve cached content when GitHub is unreachable and recover gracefully when a replica is incomplete.

## Approaches

1. **Replace every GitHub call globally with mirror reads:** smallest call-site diff but unsafe; writer validation and repair tooling intentionally need remote truth. Rejected.
2. **Keep the current dual paths and add per-view caches:** some navigation improves, but frequent broad revalidation and duplicated binary decoding remain. Rejected.
3. **Selected: unified local read layer plus independent verified GitHub reconciliation:** route normal display reads to the existing replica, avoid redundant forced refreshes, and keep explicit fresh APIs for writes, audits and native watch synchronization. Local image URLs are shared within the app and work with the current poster revisions.

## Implementation boundaries

- A reusable reader returns only objects whose path, SHA and bytes match the current complete mirror manifest; absence falls back to the existing remote read.
- Expand local seeding/derived views for the dashboard and media, ideas, plans, economy, documents, files and image indexes. Background sync invalidates or refreshes local projections based on verified changed SHA.
- Stop duplicating remote re-fetches after replica completion; preserve explicit force refresh and write-conflict behavior.
- Bound background loading of the current page's images, prioritize visible images, and reuse processed blobs across cards without leaking unbounded object URLs.
- Keep historical activity and streaming availability network-dependent where the complete current mirror cannot supply equivalent evidence; show previous validated results promptly.

## Verification

- Regression tests distinguish normal local reads, offline startup, changed commits, incomplete/corrupt mirror fallback and explicit forced freshness.
- Check GitHub mutations still use the live expected SHA and pending writes survive failures.
- Type check, existing test suite, production bundle and Android-specific contract tests, followed by review of files changed.
