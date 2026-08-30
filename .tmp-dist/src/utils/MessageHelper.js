"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessage = sendMessage;
async function sendMessage(read, modify, room, text, attachment, threadId) {
    const appUser = await read.getUserReader().getAppUser();
    if (!appUser) {
        return;
    }
    const builder = modify.getCreator().startMessage()
        .setRoom(room)
        .setSender(appUser)
        .setText(text)
        .setGroupable(false);
    if (threadId) {
        builder.setThreadId(threadId);
    }
    if (attachment) {
        builder.setAttachments([attachment]);
    }
    await modify.getCreator().finish(builder);
}
