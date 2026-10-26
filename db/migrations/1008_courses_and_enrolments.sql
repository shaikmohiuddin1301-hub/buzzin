-- Course creation and learner progress.
--
-- A course is still a `learning_resources` row (format = 'course') so existing
-- discovery, moderation, feedback and profile surfaces keep working. These
-- columns hold the course-specific detail, while modules and lessons already
-- live in `course_modules` and `lessons`.
--
-- Existing rows get safe defaults: public visibility, no additional metadata.
-- Nothing is recreated and no learner or resource content is removed.

ALTER TABLE `courses` ADD COLUMN `category` text;
--> statement-breakpoint
ALTER TABLE `courses` ADD COLUMN `skills` text DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE `courses` ADD COLUMN `outcomes` text DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE `courses` ADD COLUMN `audience` text;
--> statement-breakpoint
ALTER TABLE `courses` ADD COLUMN `visibility` text DEFAULT 'public' NOT NULL;
--> statement-breakpoint
ALTER TABLE `courses` ADD COLUMN `preview_video_url` text;
--> statement-breakpoint
ALTER TABLE `courses` ADD COLUMN `attribution` text;
--> statement-breakpoint
ALTER TABLE `courses` ADD COLUMN `estimated_minutes` integer;
--> statement-breakpoint
ALTER TABLE `courses` ADD COLUMN `updated_at` text;
--> statement-breakpoint
CREATE INDEX `courses_visibility_idx` ON `courses` (`visibility`);
--> statement-breakpoint
ALTER TABLE `course_modules` ADD COLUMN `description` text;
--> statement-breakpoint
ALTER TABLE `lessons` ADD COLUMN `video_url` text;
--> statement-breakpoint
ALTER TABLE `lessons` ADD COLUMN `external_url` text;
--> statement-breakpoint
ALTER TABLE `lessons` ADD COLUMN `external_label` text;
--> statement-breakpoint
ALTER TABLE `lessons` ADD COLUMN `external_author` text;
--> statement-breakpoint
ALTER TABLE `lessons` ADD COLUMN `project_id` text REFERENCES `projects` (`id`) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX `lessons_project_idx` ON `lessons` (`project_id`);
--> statement-breakpoint

CREATE TABLE `course_collaborators` (
  `id` text PRIMARY KEY NOT NULL,
  `resource_id` text NOT NULL REFERENCES `learning_resources` (`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE,
  `added_by` text NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_collaborators_uq` ON `course_collaborators` (`resource_id`,`user_id`);
--> statement-breakpoint
CREATE INDEX `course_collaborators_user_idx` ON `course_collaborators` (`user_id`);
--> statement-breakpoint

CREATE TABLE `course_enrollments` (
  `id` text PRIMARY KEY NOT NULL,
  `resource_id` text NOT NULL REFERENCES `learning_resources` (`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE,
  `status` text DEFAULT 'active' NOT NULL,
  `enrolled_at` text NOT NULL,
  `last_accessed_at` text,
  `completed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_enrollments_uq` ON `course_enrollments` (`resource_id`,`user_id`);
--> statement-breakpoint
CREATE INDEX `course_enrollments_user_idx` ON `course_enrollments` (`user_id`,`status`);
--> statement-breakpoint
CREATE INDEX `course_enrollments_resource_idx` ON `course_enrollments` (`resource_id`,`status`);
