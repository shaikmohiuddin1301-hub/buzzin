ALTER TABLE `conversations` ADD COLUMN `task_id` text;
--> statement-breakpoint
CREATE INDEX `conversations_task_idx` ON `conversations` (`task_id`);
--> statement-breakpoint
ALTER TABLE `tasks` ADD COLUMN `priority` text DEFAULT 'normal' NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `open_to_collaborators` integer DEFAULT 1 NOT NULL;
