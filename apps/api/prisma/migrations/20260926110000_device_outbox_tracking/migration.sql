-- AlterTable
ALTER TABLE "devices" ADD COLUMN "has_pending_outbox" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "devices" ADD COLUMN "outbox_pending_count" INTEGER NOT NULL DEFAULT 0;
