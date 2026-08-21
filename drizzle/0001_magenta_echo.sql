PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`company` text NOT NULL,
	`role` text,
	`status` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "applications_status_check" CHECK("status" IN ('applying', 'needs-review', 'submitted', 'paused', 'skipped'))
);
--> statement-breakpoint
INSERT INTO `__new_applications`("id", "company", "role", "status", "updated_at") SELECT "id", "company", "role", "status", "updated_at" FROM `applications`;--> statement-breakpoint
DROP TABLE `applications`;--> statement-breakpoint
ALTER TABLE `__new_applications` RENAME TO `applications`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
