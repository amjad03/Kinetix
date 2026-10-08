ALTER TYPE "public"."notification_kind" ADD VALUE IF NOT EXISTS 'placement';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE IF NOT EXISTS 'grievance';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE IF NOT EXISTS 'welfare';--> statement-breakpoint
ALTER TYPE "public"."role_name" ADD VALUE IF NOT EXISTS 'placement_officer';--> statement-breakpoint
ALTER TYPE "public"."role_name" ADD VALUE IF NOT EXISTS 'research_coordinator';--> statement-breakpoint
ALTER TYPE "public"."role_name" ADD VALUE IF NOT EXISTS 'grievance_officer';--> statement-breakpoint
ALTER TYPE "public"."role_name" ADD VALUE IF NOT EXISTS 'counsellor';--> statement-breakpoint
ALTER TYPE "public"."role_name" ADD VALUE IF NOT EXISTS 'icc_member';
