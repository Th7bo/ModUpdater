CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"build_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"mod_id" text,
	"mod_version" text,
	"display_name" text,
	"loader" text DEFAULT 'fabric' NOT NULL,
	"mc_versions_json" text DEFAULT '[]' NOT NULL,
	"mc_versions_raw" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_build_id_build_runs_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."build_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifacts_mod_id_idx" ON "artifacts" USING btree ("mod_id");