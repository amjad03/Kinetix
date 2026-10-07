ALTER TABLE "concept_videos" ADD COLUMN "scope" text DEFAULT 'platform' NOT NULL;--> statement-breakpoint
ALTER TABLE "concept_videos" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "concept_videos" ADD COLUMN "section_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "concept_videos" ADD COLUMN "share_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "concept_videos" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "concept_videos" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "concept_videos" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "concept_videos" ADD CONSTRAINT "concept_videos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_videos" ADD CONSTRAINT "concept_videos_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_videos" ADD CONSTRAINT "concept_videos_scope_ck" CHECK ((scope = 'platform' AND tenant_id IS NULL) OR (scope IN ('institution', 'teacher') AND tenant_id IS NOT NULL));--> statement-breakpoint
ALTER TABLE "concept_videos" ADD CONSTRAINT "concept_videos_share_ck" CHECK (share_status IN ('none', 'pending', 'approved', 'rejected'));--> statement-breakpoint
DROP INDEX "concept_videos_topic_video_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "concept_videos_platform_uq" ON "concept_videos" USING btree ("topic_id","youtube_video_id") WHERE scope = 'platform';--> statement-breakpoint
CREATE UNIQUE INDEX "concept_videos_institution_uq" ON "concept_videos" USING btree ("tenant_id","topic_id","youtube_video_id") WHERE scope = 'institution';--> statement-breakpoint
CREATE UNIQUE INDEX "concept_videos_teacher_uq" ON "concept_videos" USING btree ("created_by","topic_id","youtube_video_id") WHERE scope = 'teacher';--> statement-breakpoint
CREATE INDEX "concept_videos_tenant_idx" ON "concept_videos" USING btree ("tenant_id","share_status");--> statement-breakpoint
-- Row-level security, in the pattern of chapters and topics (0011): platform rows (tenant_id null) are
-- readable by everyone; an institution reads and writes only rows carrying its own tenant_id, so
-- another institution's videos (institution or teacher scope) are invisible and cannot be written.
-- Which of a tenant's teacher videos a person sees (their sections, or approved for all) is
-- decided by ConceptVideosService, because the policy knows the tenant but not the person.
-- Platform rows are still written only by the owner role (src/platform/).
DO $$
BEGIN
  ALTER TABLE concept_videos ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS tenant_isolation ON concept_videos;
  DROP POLICY IF EXISTS global_read ON concept_videos;
  CREATE POLICY tenant_isolation ON concept_videos
    USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (scope <> 'platform' AND tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  CREATE POLICY global_read ON concept_videos FOR SELECT USING (scope = 'platform' AND tenant_id IS NULL);
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON concept_videos TO kinetix_app;
  END IF;
END $$;
