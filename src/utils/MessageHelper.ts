import { IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IMessageAttachment } from '@rocket.chat/apps-engine/definition/messages';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { BlockBuilder, IBlock } from '@rocket.chat/apps-engine/definition/uikit';
import { asNonEmptyString } from './Validator';

/**
 * Sends a message to a room as the App Bot user.
 *
 * @param read Accessor for reading app/user data
 * @param modify Accessor for creating new entities
 * @param room Target room instance
 * @param text Content of the message
 * @param attachment Optional rich attachment (citations, cards, buttons)
 * @param threadId Optional thread ID to send reply within a thread
 */
export async function sendMessage(
    read: IRead,
    modify: IModify,
    room: IRoom | unknown,
    text: string,
    attachment?: IMessageAttachment,
    threadId?: string,
): Promise<void> {
    const appUser = await read.getUserReader().getAppUser();
    if (!appUser) {
        return;
    }

    const safeText = asNonEmptyString(text, '...');
    const builder = modify.getCreator().startMessage()
        .setRoom(room as IRoom)
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

/**
 * Sends an immediate placeholder ("thinking"/"searching") message so the user
 * receives instant visual feedback while the background RAG pipeline processes
 * the query (~2–15s).
 *
 * Returns the created message ID to allow in-place replacement via `updateMessage`.
 *
 * @param read Accessor for reading app/user data
 * @param modify Accessor for creating new entities
 * @param room Target room instance
 * @param text Initial placeholder status text
 * @param threadId Optional thread ID
 * @returns Generated message ID or undefined if appUser is missing
 */
export async function sendPlaceholderMessage(
    read: IRead,
    modify: IModify,
    room: IRoom | unknown,
    text: string,
    threadId?: string,
): Promise<string | undefined> {
    const appUser = await read.getUserReader().getAppUser();
    if (!appUser) {
        return undefined;
    }

    const safeText = asNonEmptyString(text, '🔍 _Đang xử lý..._');
    const builder = modify.getCreator().startMessage()
        .setRoom(room as IRoom)
        .setSender(appUser)
        .setText(safeText)
        .setGroupable(false);

    if (threadId) {
        builder.setThreadId(threadId);
    }

    return modify.getCreator().finish(builder);
}

/**
 * Updates an existing placeholder message in-place with the final answer
 * and optional citation attachments.
 *
 * Uses `modify.getUpdater().message()` with the app bot user as editor.
 *
 * @param messageId ID of the placeholder message to update
 * @param read Accessor for reading app/user data
 * @param modify Accessor for updating existing entities
 * @param text Updated answer text
 * @param attachment Optional citation/source attachments to display
 */
export async function updateMessage(
    messageId: string,
    read: IRead,
    modify: IModify,
    text: string,
    attachment?: IMessageAttachment,
    blocks?: BlockBuilder | IBlock[],
): Promise<void> {
    if (!messageId || typeof messageId !== 'string' || !messageId.trim()) {
        throw new Error('Invalid messageId for updateMessage');
    }

    const appUser = await read.getUserReader().getAppUser();
    if (!appUser) {
        throw new Error('App user not found');
    }

    const safeText = asNonEmptyString(text, '...');
    const builder = await modify.getUpdater().message(messageId, appUser);
    builder.setText(safeText);
    builder.setEditor(appUser);

    if (attachment) {
        builder.setAttachments([attachment]);
    } else {
        builder.setAttachments([]);
    }

    if (blocks) {
        builder.setBlocks(blocks);
    }

    await modify.getUpdater().finish(builder);
}

/**
 * Sends a private notification to a specific user in a room.
 */
export async function sendNotification(
    read: IRead,
    modify: IModify,
    user: any,
    room: IRoom | unknown,
    text: string,
): Promise<void> {
    const appUser = await read.getUserReader().getAppUser();
    if (!appUser || !user) {
        return;
    }

    const safeText = asNonEmptyString(text, '...');
    const builder = modify.getCreator().startMessage()
        .setRoom(room as IRoom)
        .setSender(appUser)
        .setText(safeText)
        .setGroupable(false);

    await modify.getNotifier().notifyUser(user, builder.getMessage());
}

/**
 * Sends a message with UIKit blocks to a room.
 */
export async function sendMessageWithBlocks(
    read: IRead,
    modify: IModify,
    room: IRoom | unknown,
    text: string,
    blocks: BlockBuilder | IBlock[],
    threadId?: string,
): Promise<void> {
    const appUser = await read.getUserReader().getAppUser();
    if (!appUser) {
        return;
    }

    const safeText = asNonEmptyString(text, '...');
    const builder = modify.getCreator().startMessage()
        .setRoom(room as IRoom)
        .setSender(appUser)
        .setText(safeText)
        .setBlocks(blocks)
        .setGroupable(false);

    if (threadId) {
        builder.setThreadId(threadId);
    }

    await modify.getCreator().finish(builder);
}




