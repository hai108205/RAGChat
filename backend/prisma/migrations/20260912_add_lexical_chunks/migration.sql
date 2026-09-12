CREATE TABLE "RagLexicalChunk" (
    "id" TEXT NOT NULL,
    "chat_source_id" TEXT NOT NULL,
    "chunk_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "locator" TEXT NOT NULL,
    "heading" TEXT,
    "page_url" TEXT,
    "document_id" TEXT,
    "version_hash" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RagLexicalChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RagLexicalChunk_chat_source_id_chunk_id_key" ON "RagLexicalChunk"("chat_source_id", "chunk_id");
CREATE INDEX "RagLexicalChunk_chat_source_id_idx" ON "RagLexicalChunk"("chat_source_id");
CREATE INDEX "RagLexicalChunk_document_id_idx" ON "RagLexicalChunk"("document_id");

-- PostgreSQL GIN full-text index using 'simple' configuration for language-neutral matching
CREATE INDEX "RagLexicalChunk_content_search_idx" ON "RagLexicalChunk" USING gin (to_tsvector('simple', "content"));

ALTER TABLE "RagLexicalChunk" ADD CONSTRAINT "RagLexicalChunk_chat_source_id_fkey" FOREIGN KEY ("chat_source_id") REFERENCES "ChatSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RagLexicalChunk" ADD CONSTRAINT "RagLexicalChunk_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "RagDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
