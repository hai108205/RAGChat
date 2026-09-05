ALTER TABLE "ChatMessageSource" ADD COLUMN "source_id" TEXT;
ALTER TABLE "ChatMessageSource" ADD COLUMN "document_id" TEXT;
ALTER TABLE "ChatMessageSource" ADD COLUMN "chunk_id" TEXT;
ALTER TABLE "ChatMessageSource" ADD COLUMN "version_hash" TEXT;

CREATE INDEX "ChatMessageSource_document_id_idx" ON "ChatMessageSource"("document_id");
CREATE INDEX "ChatMessageSource_chunk_id_idx" ON "ChatMessageSource"("chunk_id");
