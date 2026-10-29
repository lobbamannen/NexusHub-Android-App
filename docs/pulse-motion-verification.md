# Pulse and motion verification · 2026-10-29

Implements approved ideas 1 (Pulse), 23 (living welcome border) and 24 (navigation motion).

- Pulse merges positive same-day additions with at most two actions: nearest ongoing/upcoming calendar event and grouped confirmed unread series findings. Reuses Stockholm dates, existing calendar filters, native read permission, local replicas and release history. No AI or new API service.
- Welcome border uses an 18-second SVG perimeter trace, existing blue/violet tokens and resize/visibility handling. Decoration pauses offscreen/background and becomes static under reduced motion.
- Navigation uses View Transitions + CSS on existing guarded routes, selected poster source/destination matching, retained image leases, reverse navigation and retained closing presence for menus/upload/settings. Unsupported capture falls back to one normal state update.

## Checks completed locally

- TypeScript check, original design contract, production Vite build.
- 141 tests passed, including the existing workflow suite, Pulse domain/presentation, rapid/failed transition lifecycle, Android Back contract and image cache tests.
- Review findings repaired: deferred category/calendar navigation, failed-capture cleanup, uncached image destinations, image lifetime, independent phone calendar reads, reverse panel presence.

## Browser and device verification

The available cloud browser could not connect to the workspace localhost server (connection refused). No local browser screenshot or physical Android result is claimed.
The independent `Verify Pulse and motion UI` GitHub workflow checks real Chromium rendering at 320/412/900 px, counters, action routing, forward/back poster state and cleanup, panels and reduced motion. Its result is separate from the APK build.
Physical Samsung launcher/app testing remains a follow-up when installing the combined APK; no APK is downloaded or awaited for this task.
