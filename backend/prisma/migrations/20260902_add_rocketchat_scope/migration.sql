-- AlterTable Chat
ALTER TABLE "Chat" ADD COLUMN "rocketchat_scope_key" TEXT,
ADD COLUMN "rocketchat_workspace_id" TEXT,
ADD COLUMN "rocketchat_room_id" TEXT,
ADD COLUMN "rocketchat_thread_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Chat_rocketchat_scope_key_key" ON "Chat"("rocketchat_scope_key");
CREATE INDEX "Chat_rocketchat_workspace_id_rocketchat_room_id_created_at_idx" ON "Chat"("rocketchat_workspace_id", "rocketchat_room_id", "created_at");

-- AlterTable ChatSource: Drop legacy unique constraint and add dedupe_key
DROP INDEX IF EXISTS "ChatSource_documentation_url_is_vector_less_key";

ALTER TABLE "ChatSource" ADD COLUMN "dedupe_key" TEXT;

CREATE UNIQUE INDEX "ChatSource_dedupe_key_key" ON "ChatSource"("dedupe_key");
CREATE INDEX "ChatSource_documentation_url_idx" ON "ChatSource"("documentation_url");
