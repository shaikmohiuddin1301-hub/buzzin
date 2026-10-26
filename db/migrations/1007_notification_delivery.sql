-- Notification delivery hardening.
--
-- `dedupe_key` makes notification creation idempotent: an event that is retried,
-- replayed by a double-submitted form or processed twice writes one row, not two.
-- The key is scoped per recipient, so the same event can still notify two different
-- people. SQLite treats NULLs as distinct in a unique index, so older rows and
-- notifications raised without a key are unaffected.
--
-- `entity_type`/`entity_id` record the object the notification is about (task,
-- submission, message, comment, invitation…). The href is still the canonical
-- destination, but the reference lets the app explain an expired destination
-- without guessing from a URL string.

ALTER TABLE `notifications` ADD COLUMN `dedupe_key` text;
--> statement-breakpoint
ALTER TABLE `notifications` ADD COLUMN `entity_type` text;
--> statement-breakpoint
ALTER TABLE `notifications` ADD COLUMN `entity_id` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_dedupe_uq` ON `notifications` (`user_id`,`dedupe_key`);
--> statement-breakpoint
CREATE INDEX `notifications_entity_idx` ON `notifications` (`entity_type`,`entity_id`);
