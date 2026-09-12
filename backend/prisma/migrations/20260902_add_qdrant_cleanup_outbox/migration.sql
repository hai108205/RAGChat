-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD');

-- CreateTable
CREATE TABLE "QdrantCleanupOutbox" (
    "id" TEXT NOT NULL,
    "collection_name" TEXT NOT NULL,
    "source_id" TEXT,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "QdrantCleanupOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QdrantCleanupOutbox_id_key" ON "QdrantCleanupOutbox"("id");

-- CreateIndex
CREATE INDEX "QdrantCleanupOutbox_status_created_at_idx" ON "QdrantCleanupOutbox"("status", "created_at");

-- CreateIndex
CREATE INDEX "QdrantCleanupOutbox_collection_name_idx" ON "QdrantCleanupOutbox"("collection_name");
