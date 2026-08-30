"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessage = sendMessage;
exports.sendPlaceholderMessage = sendPlaceholderMessage;
exports.updateMessage = updateMessage;
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
async function sendPlaceholderMessage(read, modify, room, text, threadId) {
    const appUser = await read.getUserReader().getAppUser();
    if (!appUser) {
        return undefined;
    }
    const builder = modify.getCreator().startMessage()
        .setRoom(room)
        .setSender(appUser)
        .setText(text)
        .setGroupable(false);
    if (threadId) {
        builder.setThreadId(threadId);
    }
    return modify.getCreator().finish(builder);
}
async function updateMessage(messageId, read, modify, text, attachment) {
    const appUser = await read.getUserReader().getAppUser();
    if (!appUser) {
        return;
    }
    const builder = await modify.getUpdater().message(messageId, appUser);
    builder.setText(text);
    if (attachment) {
        builder.setAttachments([attachment]);
    }
    else {
        builder.setAttachments([]);
    }
    await modify.getUpdater().finish(builder);
}
