# Compact home and capture Implementation Plan
> **For agentic workers:** Use superpowers:executing-plans inline. User authorized immediate implementation, publication and archiving.
**Goal:** Implement ideas 17,18,19,20,21,22 while preserving NexusHub's material identity and durable GitHub flows.
**Architecture:** Shared task controller for list and global capture; read-only archive projection; scoped home layout stylesheet.
**Tech Stack:** Existing React/TypeScript/CSS/Node/GitHub Actions.
**Spec:** docs/superpowers/specs/2026-10-27-compact-home-capture-design.md

## Global constraints
- Same Android identity, signing, local store and original design assets.
- All writes explicit, durable local draft, expected SHA. No silent conflict overwrite.
- No Site changes; archive ideas only after release verification.
## Review focus
- Retrying task save must not duplicate an item or drop existing local edits.
- Closing/reloading capture preserves text; a conflict never replaces remote data.
- Archived UUIDs cannot accidentally be saved into the active inbox.
- Long Swedish labels/text at 360px and 412px must fit; actions remain reachable.
- Removing the top menu must not remove access to upload/settings/navigation.

### Task 1: Capture (17)
- [x] Test task upsert: stable UUID on retry, preserves other items/unknown fields, optional idea link, blank/invalid rejected.
- [x] Extract shared durable useTodos controller; connect list and accessible global editor with optional idea select.
- [x] Preserve compose draft separately and clear only after verified save.
### Task 2: Inbox/archive (18)
- [x] Test live + mirror archive include archived completed/dismissed, validate identity, preserve active root listing.
- [x] Add archive=true read option, reusable read-only history view; remove main status chips.
### Task 3: Home/navigation (19–22)
- [x] Scope two-size layout in new stylesheet, keep material files byte-identical.
- [x] Remove redundant descriptions and top menu; document design rules.
- [ ] Visual mobile browser check could not run: cloud browser rejected local preview by security policy. No workaround attempted. Actual controller behavior is exercised with React renderer; CSS reviewed for 360/412px, no screenshot claim.
### Task 4: Deliver
- [x] Typecheck/design checks/targeted domain tests/build; final fresh review.
- [x] Publish via existing Actions; APK1.0.41 / run40491776454 succeeded, including stable signing and release upload.
- [x] CAS archive ideas17–22; all six destination files verified, sources absent, numbering and attachment SHAs unchanged (Databas de8985203e4f5d4911e0c6113a04075fd3afbdfa).
