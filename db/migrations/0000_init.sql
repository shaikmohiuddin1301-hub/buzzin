CREATE TABLE `achievements` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `achievements_user_idx` ON `achievements` (`user_id`);--> statement-breakpoint
CREATE TABLE `analytics_events` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`user_id` text,
	`metadata` text DEFAULT '{}',
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analytics_kind_idx` ON `analytics_events` (`kind`,`created_at`);--> statement-breakpoint
CREATE INDEX `analytics_target_idx` ON `analytics_events` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`reason_code` text,
	`metadata` text DEFAULT '{}',
	`ip` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_actor_idx` ON `audit_logs` (`actor_id`);--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `auth_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_tokens_user_idx` ON `auth_tokens` (`user_id`,`kind`);--> statement-breakpoint
CREATE TABLE `blocked_users` (
	`id` text PRIMARY KEY NOT NULL,
	`blocker_id` text NOT NULL,
	`blocked_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`blocker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`blocked_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blocked_users_uq` ON `blocked_users` (`blocker_id`,`blocked_id`);--> statement-breakpoint
CREATE TABLE `business_members` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `business_members_uq` ON `business_members` (`business_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `businesses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`industry` text,
	`website` text,
	`logo_file_id` text,
	`visibility` text DEFAULT 'public' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `businesses_slug_uq` ON `businesses` (`slug`);--> statement-breakpoint
CREATE INDEX `businesses_owner_idx` ON `businesses` (`owner_id`);--> statement-breakpoint
CREATE TABLE `challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`host_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`category` text,
	`deadline` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`host_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `challenges_slug_uq` ON `challenges` (`slug`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`parent_id` text,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'visible' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comments_target_idx` ON `comments` (`target_type`,`target_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `comments_parent_idx` ON `comments` (`parent_id`);--> statement-breakpoint
CREATE TABLE `consent_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scope` text NOT NULL,
	`project_id` text,
	`granted` integer DEFAULT false NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `consent_user_idx` ON `consent_records` (`user_id`,`scope`);--> statement-breakpoint
CREATE TABLE `contributor_attributions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text,
	`submission_id` text,
	`role` text NOT NULL,
	`summary` text,
	`verification_method` text DEFAULT 'owner_confirmed' NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`evidence` text,
	`confirmed_by` text,
	`confirmed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`submission_id`) REFERENCES `task_submissions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `attributions_user_idx` ON `contributor_attributions` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `attributions_project_idx` ON `contributor_attributions` (`project_id`);--> statement-breakpoint
CREATE TABLE `conversation_members` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`last_read_at` text,
	`muted` integer DEFAULT false NOT NULL,
	`removed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_members_uq` ON `conversation_members` (`conversation_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`kind` text NOT NULL,
	`title` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversations_project_idx` ON `conversations` (`project_id`);--> statement-breakpoint
CREATE TABLE `course_modules` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`title` text NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `modules_course_idx` ON `course_modules` (`course_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`resource_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`resource_id`) REFERENCES `learning_resources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `courses_resource_uq` ON `courses` (`resource_id`);--> statement-breakpoint
CREATE TABLE `creator_products` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`resource_id` text,
	`title` text NOT NULL,
	`description` text,
	`curriculum` text DEFAULT '[]',
	`price_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'GBP' NOT NULL,
	`refund_policy` text,
	`format` text DEFAULT 'course' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resource_id`) REFERENCES `learning_resources`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `products_creator_idx` ON `creator_products` (`creator_id`,`status`);--> statement-breakpoint
CREATE TABLE `deliverables` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`submission_id` text,
	`title` text NOT NULL,
	`description` text,
	`file_id` text,
	`url` text,
	`approved` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submission_id`) REFERENCES `task_submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `deliverables_task_idx` ON `deliverables` (`task_id`);--> statement-breakpoint
CREATE TABLE `disputes` (
	`id` text PRIMARY KEY NOT NULL,
	`raised_by` text NOT NULL,
	`attribution_id` text,
	`project_id` text,
	`task_id` text,
	`subject` text NOT NULL,
	`details` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolution` text,
	`resolved_by` text,
	`created_at` text NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`raised_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attribution_id`) REFERENCES `contributor_attributions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `disputes_status_idx` ON `disputes` (`status`);--> statement-breakpoint
CREATE TABLE `entitlements` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text,
	`resource_id` text NOT NULL,
	`source` text NOT NULL,
	`order_id` text,
	`granted_by` text,
	`created_at` text NOT NULL,
	`expires_at` text,
	`revoked_at` text,
	`revoked_reason` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `creator_products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resource_id`) REFERENCES `learning_resources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `entitlements_user_idx` ON `entitlements` (`user_id`,`revoked_at`);--> statement-breakpoint
CREATE INDEX `entitlements_resource_idx` ON `entitlements` (`resource_id`);--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`lesson_id` text NOT NULL,
	`title` text NOT NULL,
	`instructions` text NOT NULL,
	`hint` text,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `expressions_of_interest` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text,
	`user_id` text NOT NULL,
	`intent` text NOT NULL,
	`message` text,
	`work_samples` text DEFAULT '[]',
	`status` text DEFAULT 'new' NOT NULL,
	`response_message` text,
	`reviewed_by` text,
	`created_at` text NOT NULL,
	`responded_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `eoi_project_idx` ON `expressions_of_interest` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `eoi_user_idx` ON `expressions_of_interest` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `eoi_task_user_uq` ON `expressions_of_interest` (`task_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `follows` (
	`id` text PRIMARY KEY NOT NULL,
	`follower_id` text NOT NULL,
	`followee_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`follower_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`followee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `follows_uq` ON `follows` (`follower_id`,`followee_id`);--> statement-breakpoint
CREATE INDEX `follows_followee_idx` ON `follows` (`followee_id`);--> statement-breakpoint
CREATE TABLE `generated_media` (
	`id` text PRIMARY KEY NOT NULL,
	`storyboard_id` text NOT NULL,
	`kind` text NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`file_id` text,
	`url` text,
	`error` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`storyboard_id`) REFERENCES `storyboards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `generated_media_story_idx` ON `generated_media` (`storyboard_id`);--> statement-breakpoint
CREATE TABLE `learner_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`rating` integer NOT NULL,
	`body` text,
	`status` text DEFAULT 'visible' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resource_id`) REFERENCES `learning_resources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feedback_uq` ON `learner_feedback` (`user_id`,`resource_id`);--> statement-breakpoint
CREATE TABLE `learning_journey_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`kind` text DEFAULT 'context' NOT NULL,
	`source_type` text,
	`source_id` text,
	`skill_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`journey_id`) REFERENCES `learning_journeys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `journey_steps_journey_idx` ON `learning_journey_steps` (`journey_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `learning_journeys` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`task_id` text,
	`creator_id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`created_at` text NOT NULL,
	`published_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `journeys_project_idx` ON `learning_journeys` (`project_id`);--> statement-breakpoint
CREATE INDEX `journeys_creator_idx` ON `learning_journeys` (`creator_id`);--> statement-breakpoint
CREATE TABLE `learning_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`lesson_id` text,
	`completed` integer DEFAULT false NOT NULL,
	`progress_pct` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resource_id`) REFERENCES `learning_resources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `progress_uq` ON `learning_progress` (`user_id`,`resource_id`,`lesson_id`);--> statement-breakpoint
CREATE TABLE `learning_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`project_id` text,
	`task_id` text,
	`journey_id` text,
	`storyboard_id` text,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`summary` text,
	`body` text,
	`preview_body` text,
	`topic` text,
	`level` text DEFAULT 'beginner' NOT NULL,
	`format` text DEFAULT 'article' NOT NULL,
	`duration_minutes` integer,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'GBP' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` text,
	`scheduled_for` text,
	`cover_image_id` text,
	`video_file_id` text,
	`transcript` text,
	`captions` text,
	`view_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`journey_id`) REFERENCES `learning_journeys`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cover_image_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`video_file_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resources_slug_uq` ON `learning_resources` (`slug`);--> statement-breakpoint
CREATE INDEX `resources_status_idx` ON `learning_resources` (`status`,`published_at`);--> statement-breakpoint
CREATE INDEX `resources_creator_idx` ON `learning_resources` (`creator_id`);--> statement-breakpoint
CREATE INDEX `resources_topic_idx` ON `learning_resources` (`topic`);--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`module_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`order_index` integer DEFAULT 0 NOT NULL,
	`is_free_preview` integer DEFAULT false NOT NULL,
	`duration_minutes` integer,
	`media_id` text,
	FOREIGN KEY (`module_id`) REFERENCES `course_modules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `lessons_module_idx` ON `lessons` (`module_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `media_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`storyboard_id` text NOT NULL,
	`approver_id` text NOT NULL,
	`decision` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`storyboard_id`) REFERENCES `storyboards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`approver_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `media_approvals_story_idx` ON `media_approvals` (`storyboard_id`);--> statement-breakpoint
CREATE TABLE `media_files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text,
	`project_id` text,
	`task_id` text,
	`storage_key` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`checksum` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `media_owner_idx` ON `media_files` (`owner_id`);--> statement-breakpoint
CREATE INDEX `media_project_idx` ON `media_files` (`project_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`body` text NOT NULL,
	`attachment_id` text,
	`edited_at` text,
	`deleted_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attachment_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `messages_conversation_idx` ON `messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `moderation_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`moderator_id` text NOT NULL,
	`report_id` text,
	`action` text NOT NULL,
	`reason_code` text NOT NULL,
	`notes` text,
	`target_user_id` text,
	`target_type` text,
	`target_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`moderator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `moderation_actions_target_idx` ON `moderation_actions` (`target_user_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`href` text,
	`actor_id` text,
	`read_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`read_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`title` text NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `creator_products`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`buyer_id` text NOT NULL,
	`product_id` text NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'GBP' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`method` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`buyer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `creator_products`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `orders_buyer_idx` ON `orders` (`buyer_id`);--> statement-breakpoint
CREATE INDEX `orders_product_idx` ON `orders` (`product_id`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`project_id` text,
	`task_id` text,
	`resource_id` text,
	`kind` text DEFAULT 'general' NOT NULL,
	`body` text NOT NULL,
	`image_id` text,
	`visibility` text DEFAULT 'public' NOT NULL,
	`hidden_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `posts_created_idx` ON `posts` (`created_at`);--> statement-breakpoint
CREATE INDEX `posts_author_idx` ON `posts` (`author_id`);--> statement-breakpoint
CREATE INDEX `posts_project_idx` ON `posts` (`project_id`);--> statement-breakpoint
CREATE TABLE `project_follows` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_follows_uq` ON `project_follows` (`project_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `project_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`inviter_id` text NOT NULL,
	`invitee_id` text,
	`invitee_email` text,
	`role` text DEFAULT 'collaborator' NOT NULL,
	`message` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`responded_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invitee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_invitations_invitee_idx` ON `project_invitations` (`invitee_id`,`status`);--> statement-breakpoint
CREATE TABLE `project_members` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'collaborator' NOT NULL,
	`title` text,
	`status` text DEFAULT 'active' NOT NULL,
	`invited_by` text,
	`joined_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_members_uq` ON `project_members` (`project_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `project_members_user_idx` ON `project_members` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `project_milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`due_date` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`completed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `milestones_project_idx` ON `project_milestones` (`project_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `project_skills` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`skill_id` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_skills_uq` ON `project_skills` (`project_id`,`skill_id`);--> statement-breakpoint
CREATE TABLE `project_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_updates_project_idx` ON `project_updates` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`business_id` text,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`short_description` text NOT NULL,
	`overview` text,
	`problem` text,
	`audience` text,
	`category` text NOT NULL,
	`stage` text DEFAULT 'idea' NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`work_mode` text DEFAULT 'remote' NOT NULL,
	`effort` text,
	`deadline` text,
	`compensation_type` text DEFAULT 'unpaid' NOT NULL,
	`compensation_details` text,
	`allow_public_docs` integer DEFAULT false NOT NULL,
	`confidentiality_notes` text,
	`ip_notes` text,
	`links` text DEFAULT '[]',
	`cover_image_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` text,
	`view_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cover_image_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_uq` ON `projects` (`slug`);--> statement-breakpoint
CREATE INDEX `projects_owner_idx` ON `projects` (`owner_id`);--> statement-breakpoint
CREATE INDEX `projects_status_idx` ON `projects` (`status`,`visibility`);--> statement-breakpoint
CREATE INDEX `projects_category_idx` ON `projects` (`category`);--> statement-breakpoint
CREATE INDEX `projects_business_idx` ON `projects` (`business_id`);--> statement-breakpoint
CREATE TABLE `reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`kind` text DEFAULT 'like' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reactions_uq` ON `reactions` (`user_id`,`target_type`,`target_id`,`kind`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reason_code` text NOT NULL,
	`details` text,
	`status` text DEFAULT 'open' NOT NULL,
	`assigned_to` text,
	`resolution` text,
	`created_at` text NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reports_status_idx` ON `reports` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `reports_target_idx` ON `reports` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `reputation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`dimension` text NOT NULL,
	`skill_id` text,
	`points` integer NOT NULL,
	`reason` text NOT NULL,
	`source_type` text,
	`source_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `reputation_user_idx` ON `reputation_events` (`user_id`,`dimension`);--> statement-breakpoint
CREATE TABLE `saved_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_items_uq` ON `saved_items` (`user_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `saved_searches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scope` text NOT NULL,
	`query` text NOT NULL,
	`filters` text DEFAULT '{}',
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `saved_searches_user_idx` ON `saved_searches` (`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expiry_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`category` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skills_slug_uq` ON `skills` (`slug`);--> statement-breakpoint
CREATE TABLE `story_scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`storyboard_id` text NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`title` text NOT NULL,
	`narration` text NOT NULL,
	`visual_description` text,
	`motion` text DEFAULT 'fade' NOT NULL,
	`duration_seconds` integer DEFAULT 6 NOT NULL,
	`source_type` text,
	`source_id` text,
	`contributors` text DEFAULT '[]',
	`fact_status` text DEFAULT 'documented' NOT NULL,
	`ai_generated` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`storyboard_id`) REFERENCES `storyboards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scenes_story_idx` ON `story_scenes` (`storyboard_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `storyboards` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`task_id` text,
	`created_by` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`provider` text DEFAULT 'local' NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`transcript` text,
	`ai_generated` integer DEFAULT true NOT NULL,
	`approved_by` text,
	`approved_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `storyboards_project_idx` ON `storyboards` (`project_id`);--> statement-breakpoint
CREATE TABLE `task_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`assigned_by` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`responsibilities` text,
	`scope_confirmed_at` text,
	`assigned_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_assignments_uq` ON `task_assignments` (`task_id`,`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `task_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`decision` text NOT NULL,
	`reason` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submission_id`) REFERENCES `task_submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_reviews_task_idx` ON `task_reviews` (`task_id`);--> statement-breakpoint
CREATE TABLE `task_skills` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`skill_id` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_skills_uq` ON `task_skills` (`task_id`,`skill_id`);--> statement-breakpoint
CREATE TABLE `task_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'submitted' NOT NULL,
	`reviewer_id` text,
	`review_note` text,
	`submitted_at` text NOT NULL,
	`reviewed_at` text,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `submissions_task_idx` ON `task_submissions` (`task_id`,`status`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`created_by` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`objective` text,
	`deliverables_spec` text,
	`acceptance_criteria` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`effort` text,
	`deadline` text,
	`compensation_type` text DEFAULT 'unpaid' NOT NULL,
	`compensation_details` text,
	`visibility` text DEFAULT 'public' NOT NULL,
	`confidentiality` text,
	`published_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tasks_project_idx` ON `tasks` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `tasks_deadline_idx` ON `tasks` (`deadline`);--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`profile_visibility` text DEFAULT '{"contributions":true,"learning":true,"followers":true}' NOT NULL,
	`allow_direct_messages` text DEFAULT 'project_members' NOT NULL,
	`show_email` integer DEFAULT false NOT NULL,
	`notify_email` integer DEFAULT true NOT NULL,
	`notify_matrix` text DEFAULT '{}' NOT NULL,
	`categories` text DEFAULT '[]' NOT NULL,
	`interests` text DEFAULT '[]' NOT NULL,
	`reduce_motion` integer DEFAULT false NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_roles_uq` ON `user_roles` (`user_id`,`role`);--> statement-breakpoint
CREATE TABLE `user_skills` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`level` text DEFAULT 'beginner' NOT NULL,
	`evidence_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_skills_uq` ON `user_skills` (`user_id`,`skill_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`email_verified_at` text,
	`avatar_url` text,
	`avatar_file_id` text,
	`bio` text,
	`location` text,
	`timezone` text,
	`portfolio_urls` text DEFAULT '[]',
	`goals` text DEFAULT '[]',
	`onboarding_completed_at` text,
	`is_admin` integer DEFAULT false NOT NULL,
	`is_moderator` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`suspended_reason` text,
	`last_seen_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_uq` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `users_status_idx` ON `users` (`status`);--> statement-breakpoint
CREATE TABLE `work_log_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`author_id` text NOT NULL,
	`kind` text DEFAULT 'note' NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`link_url` text,
	`file_id` text,
	`visibility` text DEFAULT 'team' NOT NULL,
	`approved_by` text,
	`approved_at` text,
	`edit_history` text DEFAULT '[]',
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `worklog_task_idx` ON `work_log_entries` (`task_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `worklog_author_idx` ON `work_log_entries` (`author_id`);