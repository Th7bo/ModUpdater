ALTER TABLE "repos" ADD COLUMN IF NOT EXISTS "jdk_version" text DEFAULT '21';--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN IF NOT EXISTS "notify_on_build_start" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'user' NOT NULL;
