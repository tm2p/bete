CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`thread_id` text,
	`user_id` text NOT NULL,
	`filename` text NOT NULL,
	`size` integer NOT NULL,
	`type` text NOT NULL,
	`discord_url` text NOT NULL,
	`uploaded_url` text,
	`upload_status` text DEFAULT 'pending' NOT NULL,
	`upload_error` text,
	`created_at` integer NOT NULL,
	`uploaded_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_attachments_channel` ON `attachments` (`channel_id`);--> statement-breakpoint
CREATE INDEX `idx_attachments_message` ON `attachments` (`message_id`);--> statement-breakpoint
CREATE INDEX `idx_attachments_status` ON `attachments` (`upload_status`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`thread_id` text,
	`user_id` text NOT NULL,
	`username` text NOT NULL,
	`avatar_url` text,
	`content` text NOT NULL,
	`edited_content` text,
	`created_at` integer NOT NULL,
	`edited_at` integer,
	`deleted_at` integer,
	`type` text DEFAULT 'text' NOT NULL,
	`metadata` text,
	`ai_status` text DEFAULT 'pending' NOT NULL,
	`ai_moderation_flags` text,
	`ai_moderation_score` real,
	`ai_moderation_raw` text,
	`ai_analysis` text,
	`ai_analyzed_at` integer,
	`ai_error` text
);
--> statement-breakpoint
CREATE INDEX `idx_messages_channel` ON `messages` (`channel_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_user` ON `messages` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_created` ON `messages` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_messages_thread` ON `messages` (`thread_id`);--> statement-breakpoint
CREATE TABLE `muxer_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`maxAttempts` integer DEFAULT 3 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `idx_muxer_jobs_status` ON `muxer_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_muxer_jobs_createdAt` ON `muxer_jobs` (`createdAt`);--> statement-breakpoint
CREATE TABLE `ui_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
