CREATE TABLE `work_areas` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`conversation_id` text,
	`created_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_areas_name_uq` ON `work_areas` (`project_id`,`name`);
--> statement-breakpoint
CREATE INDEX `work_areas_project_idx` ON `work_areas` (`project_id`);
--> statement-breakpoint
ALTER TABLE `tasks` ADD COLUMN `work_area_id` text;
--> statement-breakpoint
CREATE INDEX `tasks_work_area_idx` ON `tasks` (`work_area_id`);
--> statement-breakpoint
ALTER TABLE `messages` ADD COLUMN `parent_id` text;
--> statement-breakpoint
ALTER TABLE `messages` ADD COLUMN `task_id` text;
--> statement-breakpoint
CREATE INDEX `messages_parent_idx` ON `messages` (`parent_id`);
