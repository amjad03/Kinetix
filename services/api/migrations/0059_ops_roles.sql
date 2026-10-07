ALTER TYPE "public"."notification_kind" ADD VALUE IF NOT EXISTS 'transport';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE IF NOT EXISTS 'hostel';--> statement-breakpoint
ALTER TYPE "public"."role_name" ADD VALUE IF NOT EXISTS 'transport_manager';--> statement-breakpoint
ALTER TYPE "public"."role_name" ADD VALUE IF NOT EXISTS 'driver';--> statement-breakpoint
ALTER TYPE "public"."role_name" ADD VALUE IF NOT EXISTS 'hostel_warden';--> statement-breakpoint
ALTER TYPE "public"."role_name" ADD VALUE IF NOT EXISTS 'canteen_manager';--> statement-breakpoint
ALTER TYPE "public"."role_name" ADD VALUE IF NOT EXISTS 'store_keeper';