-- AlterTable
ALTER TABLE "ChatSource" ADD COLUMN "rocketchat_workspace_id" TEXT,
ADD COLUMN "rocketchat_room_id" TEXT,
ADD COLUMN "rocketchat_thread_id" TEXT,
ADD COLUMN "uploaded_by_rocket_user_id" TEXT;

-- CreateIndex
CREATE INDEX "ChatSource_rocketchat_workspace_id_rocketchat_room_id_created_at_idx" ON "ChatSource"("rocketchat_workspace_id", "rocketchat_room_id", "created_at");
