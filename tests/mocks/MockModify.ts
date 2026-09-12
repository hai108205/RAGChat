import type {
    IModify,
    IModifyCreator,
    IModifyDeleter,
    IModifyExtender,
    IModifyUpdater,
    IModerationModify,
    INotifier,
    IUIController,
    IMessageBuilder,
    IMessageExtender,
    ISchedulerModify,
} from '@rocket.chat/apps-engine/definition/accessors';
import type { IUIKitInteractionParam } from '@rocket.chat/apps-engine/definition/accessors/IUIController';
import type { IMessage, IMessageAttachment } from '@rocket.chat/apps-engine/definition/messages';
import type { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import type { IUser } from '@rocket.chat/apps-engine/definition/users';
import { BlockBuilder, type IBlock } from '@rocket.chat/apps-engine/definition/uikit';
import { RocketChatAssociationModel } from '@rocket.chat/apps-engine/definition/metadata';
import type { LayoutBlock } from '@rocket.chat/ui-kit';

export class MockMessageBuilder implements IMessageBuilder {
    public kind: RocketChatAssociationModel.MESSAGE = RocketChatAssociationModel.MESSAGE;
    private msg: Partial<IMessage> = {
        attachments: [],
        blocks: [],
        customFields: {},
    };

    constructor(initial?: Partial<IMessage>) {
        if (initial) this.msg = { ...initial };
    }

    public setData(data: IMessage): IMessageBuilder {
        this.msg = { ...data };
        return this;
    }

    public setUpdateData(message: IMessage, editor: IUser): IMessageBuilder {
        this.msg = { ...message, editor };
        return this;
    }

    public setRoom(room: IRoom): IMessageBuilder {
        this.msg.room = room;
        return this;
    }

    public getRoom(): IRoom {
        return this.msg.room!;
    }

    public setSender(sender: IUser): IMessageBuilder {
        this.msg.sender = sender;
        return this;
    }

    public getSender(): IUser {
        return this.msg.sender!;
    }

    public setEditor(editor: IUser): IMessageBuilder {
        this.msg.editor = editor;
        return this;
    }

    public getEditor(): IUser {
        return this.msg.editor!;
    }

    public setText(text: string): IMessageBuilder {
        this.msg.text = text;
        return this;
    }

    public getText(): string {
        return this.msg.text || '';
    }

    public setThreadId(threadId: string): IMessageBuilder {
        this.msg.threadId = threadId;
        return this;
    }

    public getThreadId(): string {
        return this.msg.threadId || '';
    }

    public setGroupable(groupable: boolean): IMessageBuilder {
        this.msg.groupable = groupable;
        return this;
    }

    public getGroupable(): boolean {
        return Boolean(this.msg.groupable);
    }

    public setParseUrls(parseUrls: boolean): IMessageBuilder {
        this.msg.parseUrls = parseUrls;
        return this;
    }

    public getParseUrls(): boolean {
        return Boolean(this.msg.parseUrls);
    }

    public setAvatarUrl(avatarUrl: string): IMessageBuilder {
        this.msg.avatarUrl = avatarUrl;
        return this;
    }

    public getAvatarUrl(): string {
        return this.msg.avatarUrl || '';
    }

    public setEmojiAvatar(emoji: string): IMessageBuilder {
        this.msg.emoji = emoji;
        return this;
    }

    public getEmojiAvatar(): string {
        return this.msg.emoji || '';
    }

    public setUsernameAlias(usernameAlias: string): IMessageBuilder {
        this.msg.alias = usernameAlias;
        return this;
    }

    public getUsernameAlias(): string {
        return this.msg.alias || '';
    }

    public setEmoji(emoji: string): IMessageBuilder {
        this.msg.emoji = emoji;
        return this;
    }

    public getEmoji(): string {
        return this.msg.emoji || '';
    }

    public addAttachment(attachment: IMessageAttachment): IMessageBuilder {
        if (!this.msg.attachments) this.msg.attachments = [];
        this.msg.attachments.push(attachment);
        return this;
    }

    public setAttachments(attachments: Array<IMessageAttachment>): IMessageBuilder {
        this.msg.attachments = attachments;
        return this;
    }

    public getAttachments(): Array<IMessageAttachment> {
        return this.msg.attachments || [];
    }

    public replaceAttachment(position: number, attachment: IMessageAttachment): IMessageBuilder {
        if (!this.msg.attachments || position < 0 || position >= this.msg.attachments.length) {
            throw new Error('Attachment position out of bounds');
        }
        this.msg.attachments[position] = attachment;
        return this;
    }

    public removeAttachment(position: number): IMessageBuilder {
        if (!this.msg.attachments || position < 0 || position >= this.msg.attachments.length) {
            throw new Error('Attachment position out of bounds');
        }
        this.msg.attachments.splice(position, 1);
        return this;
    }

    public addBlocks(blocks: BlockBuilder | Array<IBlock | LayoutBlock>): IMessageBuilder {
        const bl = (blocks as any)?.getBlocks ? (blocks as any).getBlocks() : blocks;
        if (Array.isArray(bl)) {
            this.msg.blocks = [...(this.msg.blocks || []), ...bl];
        }
        return this;
    }

    public setBlocks(blocks: BlockBuilder | Array<IBlock | LayoutBlock>): IMessageBuilder {
        const bl = (blocks as any)?.getBlocks ? (blocks as any).getBlocks() : blocks;
        this.msg.blocks = Array.isArray(bl) ? bl : [];
        return this;
    }

    public getBlocks(): Array<IBlock | LayoutBlock> {
        return (this.msg.blocks || []) as Array<IBlock | LayoutBlock>;
    }

    public addCustomField(key: string, value: any): IMessageBuilder {
        if (!this.msg.customFields) this.msg.customFields = {};
        if (key in this.msg.customFields) {
            throw new Error(`Custom field ${key} already exists`);
        }
        if (key.includes('.')) {
            throw new Error(`Custom field ${key} cannot contain periods`);
        }
        this.msg.customFields[key] = value;
        return this;
    }

    public getMessage(): IMessage {
        if (!this.msg.id) {
            this.msg.id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        }
        return this.msg as IMessage;
    }
}

export class MockModify implements IModify {
    public messages: Map<string, IMessage> = new Map();
    public notifications: Array<{ user: IUser; message: IMessage }> = [];
    public openedModals: Array<{ view: any; context: any; user: IUser }> = [];
    public updatedModals: Array<{ view: any; context: any; user: IUser }> = [];

    public getCreator(): IModifyCreator {
        return {
            startMessage: (data?: Partial<IMessage>): IMessageBuilder => {
                return new MockMessageBuilder(data);
            },
            getBlockBuilder: (): BlockBuilder => {
                return new BlockBuilder('ragchat');
            },
            finish: async (builder: IMessageBuilder): Promise<string> => {
                const msg = builder.getMessage();
                this.messages.set(msg.id!, msg);
                return msg.id!;
            },
            startLivechatMessage: () => ({} as any),
            startRoom: () => ({} as any),
            startVideoConference: () => ({} as any),
            startBot: () => ({} as any),
            startUpload: () => ({} as any),
            getUploadCreator: () => ({} as any),
        } as any;
    }

    public getUpdater(): IModifyUpdater {
        return {
            message: async (messageId: string, user: IUser): Promise<IMessageBuilder> => {
                const existing = this.messages.get(messageId) || { id: messageId, editor: user };
                return new MockMessageBuilder(existing);
            },
            finish: async (builder: IMessageBuilder): Promise<void> => {
                const msg = builder.getMessage();
                this.messages.set(msg.id!, msg);
            },
            getUserUpdater: () => ({} as any),
            getLivechatUpdater: () => ({} as any),
            getRoomUpdater: () => ({} as any),
        } as any;
    }

    public getExtender(): IModifyExtender {
        return {
            extendMessage: async (messageId: string, user: IUser): Promise<IMessageExtender> => {
                const existing = this.messages.get(messageId) || { id: messageId, editor: user };
                const builder = new MockMessageBuilder(existing);
                return builder as any;
            },
            finish: async (extender: IMessageExtender): Promise<void> => {
                const msg = (extender as any).getMessage();
                this.messages.set(msg.id!, msg);
            },
            extendRoom: () => ({} as any),
            extendVideoConference: () => ({} as any),
        } as any;
    }

    public getDeleter(): IModifyDeleter {
        return {
            deleteRoom: async (_roomId: string): Promise<void> => {},
            deleteUsers: async (_appId: any, _userType: any): Promise<boolean> => true,
            deleteMessage: async (message: IMessage, _user: IUser): Promise<void> => {
                if (message.id) this.messages.delete(message.id);
            },
            removeUsersFromRoom: async (_roomId: string, _usernames: string[]): Promise<void> => {},
        };
    }

    public getNotifier(): INotifier {
        return {
            notifyUser: async (user: IUser, message: IMessage): Promise<void> => {
                this.notifications.push({ user, message });
                if (message.id) this.messages.set(message.id, message);
            },
            notifyRoom: async (_room: IRoom, message: IMessage): Promise<void> => {
                this.messages.set(message.id || `notify_${Date.now()}`, message);
            },
            getMessageBuilder: () => new MockMessageBuilder(),
            getUserInteractionHandler: () => ({} as any),
        } as any;
    }

    public getUiController(): IUIController {
        return {
            openModalView: async (view: any, context: IUIKitInteractionParam, user: IUser): Promise<void> => {
                this.openedModals.push({ view, context, user });
            },
            updateModalView: async (view: any, context: IUIKitInteractionParam, user: IUser): Promise<void> => {
                this.updatedModals.push({ view, context, user });
            },
            openContextualBarView: async () => {},
            updateContextualBarView: async () => {},
            openSurfaceView: async () => {},
            updateSurfaceView: async () => {},
            setViewError: async () => {},
        };
    }

    public getModerationModifier(): IModerationModify {
        return {
            report: async () => {},
            dismissReportsByMessageId: async () => {},
            dismissReportsByUserId: async () => {},
        };
    }

    public getOAuthAppsModifier(): any { return {} as any; }
    public getScheduler(): ISchedulerModify { return {} as any; }
}
