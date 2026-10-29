# Calendar day sheet and combined signature widget

Approved scope: one combined widget design, not three selectable themes. Preserve two launcher rows and existing calendar/weather tap destinations. Combine nearly black translucent glass, thin gold outline, prominent centered gold signature, large date and temperature, restrained metadata. No wallpaper blur is claimed.

Calendar: entire month stays within the phone viewport. Day-cell, date, event-label and more-count taps select/toggle that civil day. Selected day is violet. Animate actual layout tracks over 280ms, with the month retaining most of the space. Inline black day sheet has a violet/gold edge, date/count/add action and separate event cards: source color, time on left, full name and location, details chevron. Same-day tap, downward handle swipe and native back close the panel. Event cards open details. Preserve edit/save/drafts and reduced-motion support.

Verification: existing calendar domain tests, compiled-production-CSS phone UI checks including whole-cell/event-label toggling and reversible geometry, native widget renders at 110/150dp, existing required APK build and signing gates. Inspect resulting screenshots. No unrelated changes.
