CREATE TYPE "RagDocumentStatus" AS ENUM ('INGESTING', 'ACTIVE', 'FAILED', 'SUPERSEDED');

CREATE TABLE "RagDocument" (
    "id" TEXT NOT NULL,
    "chat_source_id" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "version_hash" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "embedding_model" TEXT NOT NULL,
    "embedding_dimensions" INTEGER NOT NULL,
    "collection_name" TEXT NOT NULL,
    "status" "RagDocumentStatus" NOT NULL DEFAULT 'INGESTING',
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMP(3),
    CONSTRAINT "RagDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RagChunk" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content_hash" TEXT NOT NULL,
    "locator" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RagChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RagDocument_chat_source_id_version_hash_embedding_model_embedding_dimensions_key" ON "RagDocument"("chat_source_id", "version_hash", "embedding_model", "embedding_dimensions");
CREATE INDEX "RagDocument_chat_source_id_status_idx" ON "RagDocument"("chat_source_id", "status");
CREATE UNIQUE INDEX "RagChunk_document_id_chunk_index_key" ON "RagChunk"("document_id", "chunk_index");
CREATE INDEX "RagChunk_document_id_idx" ON "RagChunk"("document_id");
ALTER TABLE "RagDocument" ADD CONSTRAINT "RagDocument_chat_source_id_fkey" FOREIGN KEY ("chat_source_id") REFERENCES "ChatSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RagChunk" ADD CONSTRAINT "RagChunk_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "RagDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
