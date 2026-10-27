# Daily watch at 15:00 Stockholm
Robin authorized one automatic check per day at 15:00, with manual check retained.

- Replace six-hour periodic work with unique date-keyed one-time work, targeting the next 15:00 in Europe/Stockholm. Recalculate after execution so DST does not drift. Cancel old periodic work and old queued automatic immediate work once during upgrade.
- Persist the last automatic attempt's local date and suppress duplicate/early workers. Preserve budget, notification deduplication, baseline and cursor state. Pagination resumes the same pinned daily check via WorkManager retry (existing15-minute request throttle), rather than deferring unfinished pages a whole day. Network retries remain quota-bound; no pagination retry once900 is exhausted.
- Opening the app, syncing configuration and changing an API key must not enqueue an immediate API check. Only daily schedule and explicit Kontrollera nu may do that.
- Normalize legacy interval6 to interval24 with dailyCheckTime15:00; native accepts existing snapshots during upgrade. Show the schedule in existing settings style. Save updated GitHub settings without changing providers/quiet hours/history.
- Verify time calculation (before/after15, exact15, DST 23/25-hour days), old config normalization, native wiring and existing domain tests, typecheck/design/build. Review once, publish signed APK, verify Actions and settings read-back.

Android may delay a scheduled worker for connectivity/battery restrictions. No exact-alarm permission or extra backend.

Review: fresh reviewer checked DST, unique work, duplicate guard and trigger paths. Removed the remaining old six-hour UI sentence. Ruling: one scheduled daily logical check may resume pagination or retry a transient failure; it is not a single HTTP-attempt limit. Manual check is explicit. Both share900/month budget.
