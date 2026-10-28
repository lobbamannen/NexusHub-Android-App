# Paste Text Implementation Plan
> Execute with superpowers:executing-plans, inline implementation and one fresh final review.
**Goal:** Save complete pasted research locally and to GitHub from NexusHub inbox.
**Architecture:** Pure raw-Markdown document helper; existing durable Incoming item and sync mirror; isolated full-screen React editor.
**Tech Stack:** React/TypeScript, IndexedDB, existing GitHub mirror.
**Spec:** docs/superpowers/specs/2026-10-28-paste-text-design.md

## Global Constraints
Preserve original bytes after UTF-8 encoding. Source optional, single-line max120. No writes before Save, no duplicate on retry/double tap, never report GitHub success before verification. Preserve existing inbox/delete/idea behavior, theme, battery/calendar/weather.
## Review Focus
Whitespace/newlines/Mermaid/Unicode; empty/unsafe source; local write failure; offline/lost acknowledgment/concurrent sync; dialog cancellation/double taps/phone keyboard.

### Task 1: durable text intake
- [x] Test failing pure helper and immediate local+remote save/metadata/retry; add shared-mirror round-trip test.
- [x] Implement lib/pasted-text.mjs, platform/incoming-store.ts savePastedText, optional sourceLabel mirror/rehydration in lib/shared-incoming.mjs.
- [x] Run tests/pasted-text.test.mjs, incoming-sync/shared-incoming/idea-attachments; commit.
### Task 2: editor and release
- [x] Add components/personal/PasteTextDialog.tsx and scoped CSS, integrate button/status/source in IncomingInbox.tsx, native Back/Escape/focus.
- [x] UI harness at320/412/900: cancel creates no files, required text/optional source, exact Unicode/CRLF content, one save/double tap, offline retained/retry, local failure preserves editor, no overflow; existing weather/calendar gates.
- [x] TypeScript/design/tests/build, fresh review, address material findings, signed APK CI and verified release.
