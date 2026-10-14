-- New enquiry sources: WhatsApp, education fairs, Meta and Google lead ads, and email. Kept in their own migration
-- because a new enum value cannot be used in the transaction that adds it.
ALTER TYPE "enquiry_source" ADD VALUE IF NOT EXISTS 'whatsapp';--> statement-breakpoint
ALTER TYPE "enquiry_source" ADD VALUE IF NOT EXISTS 'fair';--> statement-breakpoint
ALTER TYPE "enquiry_source" ADD VALUE IF NOT EXISTS 'meta';--> statement-breakpoint
ALTER TYPE "enquiry_source" ADD VALUE IF NOT EXISTS 'google';--> statement-breakpoint
ALTER TYPE "enquiry_source" ADD VALUE IF NOT EXISTS 'email';
