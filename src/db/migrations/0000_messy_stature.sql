CREATE TABLE "build_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"status" text NOT NULL,
	"triggered_by" text NOT NULL,
	"commits_json" text NOT NULL,
	"artifact_paths_json" text,
	"log_tail" text,
	"started_at" timestamp NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "repos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"git_url" text NOT NULL,
	"mode" text NOT NULL,
	"branch" text NOT NULL,
	"detection_method" text NOT NULL,
	"polling_interval_ms" integer,
	"discord_channel_id" text NOT NULL,
	"custom_build_task" text,
	"ssh_private_key_path" text,
	"ssh_public_key" text,
	"webhook_secret" text,
	"upstream_url" text,
	"sync_paused" boolean DEFAULT false NOT NULL,
	"last_commit_hash" text,
	"last_build_status" text,
	"last_build_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "build_runs" ADD CONSTRAINT "build_runs_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;