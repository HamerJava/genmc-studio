CREATE TABLE `drafts` (
	`owner` text PRIMARY KEY NOT NULL,
	`skin` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `skins` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`model` text NOT NULL,
	`pixels` text NOT NULL,
	`source_id` text,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `skins_created_idx` ON `skins` (`created`);