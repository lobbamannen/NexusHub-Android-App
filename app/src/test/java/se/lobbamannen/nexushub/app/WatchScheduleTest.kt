package se.lobbamannen.nexushub.app
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant
import java.time.Duration
class WatchScheduleTest {
 @Test fun beforeAndAfterDailyTime() {
  assertEquals(Instant.parse("2026-10-27T14:00:00Z"),WatchSchedule.next(Instant.parse("2026-10-27T12:00:00Z")))
  assertEquals(Instant.parse("2026-10-28T14:00:00Z"),WatchSchedule.next(Instant.parse("2026-10-27T14:00:00Z")))
  assertEquals(Instant.parse("2026-07-27T13:00:00Z"),WatchSchedule.next(Instant.parse("2026-07-27T12:00:00Z")))
 }
 @Test fun followsStockholmDstRatherThanFixed24Hours() {
  val spring=Instant.parse("2026-03-28T14:00:00Z")
  assertEquals(23L,Duration.between(spring,WatchSchedule.next(spring)).toHours())
  val autumn=Instant.parse("2026-10-24T13:00:00Z")
  assertEquals(25L,Duration.between(autumn,WatchSchedule.next(autumn)).toHours())
 }
 @Test fun suppressesEarlyAndDuplicateAutomaticAttempts() {
  assertFalse(WatchSchedule.due(Instant.parse("2026-10-27T13:59:59Z"),null))
  assertTrue(WatchSchedule.due(Instant.parse("2026-10-27T14:00:00Z"),null))
  assertFalse(WatchSchedule.due(Instant.parse("2026-10-27T19:00:00Z"),"2026-10-27"))
  assertTrue(WatchSchedule.due(Instant.parse("2026-10-28T14:00:00Z"),"2026-10-27"))
 }
}
