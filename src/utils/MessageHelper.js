"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessage = sendMessage;
exports.sendPlaceholderMessage = sendPlaceholderMessage;
exports.updateMessage = updateMessage;
const Validator_1 = require("./Validator");
async function sendMessage(read, modify, room, text, attachment, threadId) {
    const appUser = await read.getUserReader().getAppUser();
    if (!appUser) {
        return;
    }
    const safeText = (0, Validator_1.asNonEmptyString)(text, '...');
    const builder = modify.getCreator().startMessage()
        .setRoom(room)
        .setSender(appUser)
        .setText(safeText)
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
    const safeText = (0, Validator_1.asNonEmptyString)(text, '🔍 _Đang xử lý..._');
    const builder = modify.getCreator().startMessage()
        .setRoom(room)
        .setSender(appUser)
        .setText(safeText)
        .setGroupable(false);
    if (threadId) {
        builder.setThreadId(threadId);
    }
    return modify.getCreator().finish(builder);
}
async function updateMessage(messageId, read, modify, text, attachment) {
    if (!messageId || typeof messageId !== 'string' || !messageId.trim()) {
        throw new Error('Invalid messageId for updateMessage');
    }
    const appUser = await read.getUserReader().getAppUser();
    if (!appUser) {
        throw new Error('App user not found');
    }
    const safeText = (0, Validator_1.asNonEmptyString)(text, '...');
    const builder = await modify.getUpdater().message(messageId, appUser);
    builder.setText(safeText);
    builder.setEditor(appUser);
    if (attachment) {
        builder.setAttachments([attachment]);
    }
    else {
        builder.setAttachments([]);
    }
    await modify.getUpdater().finish(builder);
}
