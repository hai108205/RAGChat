import { IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IMessageAttachment } from '@rocket.chat/apps-engine/definition/messages';

export async function sendMessage(
    read: IRead,
    modify: IModify,
    room: unknown,
    text: string,
    attachment?: IMessageAttachment,
    threadId?: string,
): Promise<void> {
    const appUser = await read.getUserReader().getAppUser();
    if (!appUser) { return; }

    const builder = modify.getCreator().startMessage()
        .setRoom(room as any)
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

/**
 * Send a placeholder (typing) message so the user gets instant feedback
 * while the RAG pipeline runs (~3–20 s).  Returns the message ID for
 * later upsert via {@link updateMessage}.
 */
export async function sendPlaceholderMessage(
    read: IRead,
    modify: IModify,
    room: unknown,
    text: string,
    threadId?: string,
): Promise<string | undefined> {
    const appUser = await read.getUserReader().getAppUser();
    if (!appUser) { return undefined; }

    const builder = modify.getCreator().startMessage()
        .setRoom(room as any)
        .setSender(appUser)
        .setText(text)
        .setGroupable(false);

    if (threadId) {
        builder.setThreadId(threadId);
    }

    return modify.getCreator().finish(builder);
}

/**
 * Replace an existing placeholder message with real content.
 * When `attachment` is provided it replaces whatever was on the original.
 */
export async function updateMessage(
    messageId: string,
    read: IRead,
    modify: IModify,
    text: string,
    attachment?: IMessageAttachment,
): Promise<void> {
    const appUser = await read.getUserReader().getAppUser();
    if (!appUser) { return; }

    const builder = await modify.getUpdater().message(messageId, appUser);
    builder.setText(text);

    if (attachment) {
        builder.setAttachments([attachment]);
    } else {
        builder.setAttachments([]);
    }

    await modify.getUpdater().finish(builder);
}
