# NexusHub Kalender V2 — approved addition
Robin explicitly asked to replace the existing calendar appearance/interaction using supplied two reference images while weather work was active. Deliver as a separate update after Weather V1. Existing calendar functionality/data/security must remain intact.

## UI and interaction
Near-full-page month as default, black NexusHub materials, subtle gold edge/light, gold calendar icon/eyebrow, month heading with violet year, purple selected Month tab and navigation controls Today/previous/next/new event. Month/Week/Agenda remain available. Monday first, ISO week numbers, red Sundays, muted outside-month dates. Real event names visible directly in cells, source color bars, reasonable clipping plus more indicator for crowded days. No sample appointments from reference images are real data to import.

Tap a day: selected day violet; month contracts smoothly in layout height, preserving text sizes and usable touch targets, while detail panel slides up below it. Animation280ms, no transform scale of calendar/text, reduced-motion respected. Tap same day again, use close control, native back or drag detail-panel handle down to close and restore fullmonth. Dragging the handle must not interfere with scrolling long event lists; cancel gesture safely on pointer cancellation.

Day panel shows date, all real events with complete wrapping titles, time/all-day semantics, location when present, source color and button to open existing details. Empty day shows Inga händelser and a create button. Panel scrolls when crowded. Plus opens existing new-event editor for selected day.

## Preserve
Phone-calendar native permission/access/invalidations, source filters, GitHub events and watched media semantics, own-event editor/draft/durable writes, conflict resolution, delete/restore, native event details/system insert. No private phone bookings sent to GitHub/PostHog. No new permissions/backend or native calendar store. Existing FullCalendar7 React component retained. Only presentation and layout selection state change. Use established time-zone-safe editor/domain helpers. Calendar date selection and event clicks must not double-toggle; detail dialog remains above day panel.

## Builder choices
CSS layout/min-height transitions in WebView, not image scaling or full native rewrite. Expanded month can show more event lines; compact month may show fewer with an explicit count while keeping font sizes unchanged. Device viewport can scroll naturally if minimum readable row heights plus panel exceed screen. Screenshots are visual references, not permission to replace existing bottom navigation with an invented one. No weather icons for days without real available forecast data. Synthetic UI-test events only, no personal/medical names from screenshots in public test fixtures.
