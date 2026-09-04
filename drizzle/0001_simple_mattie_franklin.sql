CREATE TABLE `skin_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`source_id` text,
	`skin` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `skin_sessions_owner_updated_idx` ON `skin_sessions` (`owner`,`updated`);