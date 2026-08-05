import { IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IMessageAttachment } from '@rocket.chat/apps-engine/definition/messages';

export async function sendMessage(
    read: IRead,
    modify: IModify,
    room: unknown,
    text: string,
    attachment?: IMessageAttachment,
): Promise<void> {
    const appUser = await read.getUserReader().getAppUser();
    if (!appUser) { return; }

    const builder = modify.getCreator().startMessage()
        .setRoom(room as any)
        .setSender(appUser)
        .setText(text)
        .setGroupable(false);

    if (attachment) {
        builder.setAttachments([attachment]);
    }

    await modify.getCreator().finish(builder);
}
