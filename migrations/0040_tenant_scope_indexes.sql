-- Tenant scope hardening: add indexes for tenant_id on core tables
-- These indexes improve query performance for tenant-scoped queries
-- and support the mechanical enforcement of tenant isolation.

-- Tasks: tenant_id index
CREATE INDEX IF NOT EXISTS "idx_tasks_tenant_id" ON "tasks" ("tenant_id");

-- Projects: tenant_id index  
CREATE INDEX IF NOT EXISTS "idx_projects_tenant_id" ON "projects" ("tenant_id");

-- Time entries: tenant_id index
CREATE INDEX IF NOT EXISTS "idx_time_entries_tenant_id" ON "time_entries" ("tenant_id");

-- Clients: tenant_id index
CREATE INDEX IF NOT EXISTS "idx_clients_tenant_id" ON "clients" ("tenant_id");

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS "idx_tasks_tenant_project" ON "tasks" ("tenant_id", "project_id");
CREATE INDEX IF NOT EXISTS "idx_projects_tenant_workspace" ON "projects" ("tenant_id", "workspace_id");
CREATE INDEX IF NOT EXISTS "idx_time_entries_tenant_user" ON "time_entries" ("tenant_id", "user_id");
CREATE INDEX IF NOT EXISTS "idx_clients_tenant_workspace" ON "clients" ("tenant_id", "workspace_id");
