CREATE TABLE `social_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`update_id` text,
	`author_id` text NOT NULL,
	`provider` text DEFAULT 'ayrshare' NOT NULL,
	`platforms` text NOT NULL,
	`body` text NOT NULL,
	`remote_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`update_id`) REFERENCES `project_updates`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `social_shares_project_idx` ON `social_shares` (`project_id`,`created_at`);
