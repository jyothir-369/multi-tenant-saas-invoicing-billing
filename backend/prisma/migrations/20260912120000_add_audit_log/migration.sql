CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "audit_logs_tenant_id_created_at_idx" ON "audit_logs" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "audit_logs_tenant_id_entity_type_entity_id_created_at_idx" ON "audit_logs" ("tenant_id", "entity_type", "entity_id", "created_at" DESC);
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
