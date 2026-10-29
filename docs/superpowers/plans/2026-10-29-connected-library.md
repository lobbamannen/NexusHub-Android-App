# Connected NexusHub implementation plan

**Goal:** Deliver training archive, Guardian, Command and a shared Connections/Graph over Databas in the existing Android app.
**Architecture:** Read verified local replica, derive versioned projections, persist only explicit user relations in a SHA-protected GitHub register. Existing navigation, sync, search and audit remain authoritative.
**Spec:** User-approved conversation, existing Databas training implementation plan and archive contracts.

## Constraints and review focus
- Preserve approved home design; no new greeting/Pulse boxes. No AI service or telemetry containing private content.
- Cortex is sole writer; completed workouts only, unknown values stay unknown, historic set count is shown as recorded.
- Never call incomplete indexing a complete search, or failed health checks healthy.
- Group only exact same-stem document formats; retain original files, citations and structured record identities.
- Handle stale snapshot races, corrupt months, unknown record schemas, broken links, rename/deletion and simultaneous relation edits.

## Tasks
- [ ] Domain tests RED→GREEN: training normalization/filtering, relation identities/evidence, command parsing, Guardian status.
- [ ] Replica projections: month source identity and incremental SHA cache; whole content relation index with active knowledge revisions, explicit references and source groups. SHA-guarded append/revoke register preserves unknown fields.
- [ ] UI: production training calendar/details/global filters; Connections list and focused navigable Graph; Guardian in Settings; Command in existing search. Scoped styling, accessibility and Android Back.
- [ ] Verify type/design/build and current regression suite; production component browser harness at 320/412/900 widths, interaction and screenshots. Review complete diff, fix material defects, publish and build signed APK, report phone testing still needed.

## Shared interfaces
Relations consume catalog and verified snapshot files; reader and Graph consume identical node/edge index. Guardian consumes graph diagnostics and existing audit/replica state. Training UI consumes only normalized month projections. Command consumes existing guarded navigation.
