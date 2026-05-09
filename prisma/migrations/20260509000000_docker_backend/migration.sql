-- Add hostPort column to servers table for Docker port allocation
ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "host_port" INTEGER;

-- Set default values for existing rows
ALTER TABLE "servers" ALTER COLUMN "location" SET DEFAULT 'local';
ALTER TABLE "servers" ALTER COLUMN "server_type" SET DEFAULT 'docker';
