CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "students_name_trgm_idx" ON "students" USING gin ("full_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "users_name_trgm_idx" ON "users" USING gin ("full_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "courses_title_trgm_idx" ON "courses" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "topics_title_trgm_idx" ON "topics" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "topics_fts_idx" ON "topics" USING gin (to_tsvector('simple', "title" || ' ' || "summary"));--> statement-breakpoint
CREATE INDEX "vault_documents_title_trgm_idx" ON "vault_documents" USING gin ("title" gin_trgm_ops);
