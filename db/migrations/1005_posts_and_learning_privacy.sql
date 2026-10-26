ALTER TABLE `posts` ADD COLUMN `status` text DEFAULT 'published' NOT NULL;
--> statement-breakpoint
ALTER TABLE `posts` ADD COLUMN `alt_text` text;
--> statement-breakpoint
CREATE INDEX `posts_status_idx` ON `posts` (`status`,`created_at`);
--> statement-breakpoint
ALTER TABLE `user_preferences` ADD COLUMN `share_learning_history` integer DEFAULT 0 NOT NULL;
