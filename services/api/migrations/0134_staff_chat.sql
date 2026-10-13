-- Staff chat (redesign v2 Messages): direct and group threads between staff, and external threads with parents, vendors or a university linked to email or WhatsApp.
CREATE TABLE IF NOT EXISTS "chat_threads" (id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, kind text NOT NULL, title text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '', channel text, contact_name text, contact_address text, contact_kind text, created_by uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), last_message_at timestamptz);--> statement-breakpoint
ALTER TABLE "chat_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "chat_threads";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "chat_threads" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN GRANT SELECT, INSERT, UPDATE, DELETE ON "chat_threads" TO kinetix_app; END IF; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_members" (thread_id uuid NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, role text NOT NULL DEFAULT 'member', pinned boolean NOT NULL DEFAULT false, last_read_at timestamptz, joined_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (thread_id, user_id));--> statement-breakpoint
ALTER TABLE "chat_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "chat_members";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "chat_members" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN GRANT SELECT, INSERT, UPDATE, DELETE ON "chat_members" TO kinetix_app; END IF; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_messages" (id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, thread_id uuid NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE, sender_id uuid REFERENCES users(id) ON DELETE SET NULL, direction text NOT NULL DEFAULT 'internal', body text NOT NULL DEFAULT '', external_from text, delivery text, attachment_key text, attachment_name text, attachment_type text, attachment_size integer, created_at timestamptz NOT NULL DEFAULT now());--> statement-breakpoint
ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "chat_messages";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "chat_messages" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
DO $$ BEGIN IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kinetix_app') THEN GRANT SELECT, INSERT, UPDATE, DELETE ON "chat_messages" TO kinetix_app; END IF; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS chat_members_user_idx ON chat_members (user_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS chat_messages_thread_idx ON chat_messages (thread_id, created_at);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS chat_threads_contact_idx ON chat_threads (channel, contact_address);
