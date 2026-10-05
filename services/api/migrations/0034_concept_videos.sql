CREATE TABLE "concept_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"youtube_video_id" text NOT NULL,
	"title" text NOT NULL,
	"language" "language" DEFAULT 'en' NOT NULL,
	"duration_seconds" integer,
	"channel_title" text,
	"playlist_id" text,
	"position" smallint NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "concept_videos" ADD CONSTRAINT "concept_videos_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_videos" ADD CONSTRAINT "concept_videos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "concept_videos_topic_video_uq" ON "concept_videos" USING btree ("topic_id","youtube_video_id");--> statement-breakpoint
CREATE INDEX "concept_videos_topic_idx" ON "concept_videos" USING btree ("topic_id","position");--> statement-breakpoint
-- Access. concept_videos is global, like curricula and courses: every institution reads it and
-- only the platform team writes it, through the owner role (src/platform/). platform_admins is
-- not granted to the app role at all; SystemLookups reads it as the owner.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN
    REVOKE ALL ON concept_videos, platform_admins FROM kinetix_app;
    GRANT SELECT ON concept_videos TO kinetix_app;
  END IF;
END $$;