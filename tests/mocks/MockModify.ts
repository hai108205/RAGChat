import {
    IModify,
    IModifyCreator,
    IModifyExtender,
    IModifyUpdater,
    INotifier,
    IUIController,
    IMessageBuilder,
    IMessageExtender,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IMessage } from '@rocket.chat/apps-engine/definition/messages';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { BlockBuilder, IUIKitInteractionParam } from '@rocket.chat/apps-engine/definition/uikit';

export class MockMessageBuilder implements IMessageBuilder {
    private msg: Partial<IMessage> = {
        attachments: [],
        blocks: [],
    };

    constructor(initial?: Partial<IMessage>) {
        if (initial) this.msg = { ...initial };
    }

    public setData(data: IMessage): IMessageBuilder {
        this.msg = { ...data };
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

    public addAttachment(attachment: any): IMessageBuilder {
        if (!this.msg.attachments) this.msg.attachments = [];
        this.msg.attachments.push(attachment);
        return this;
    }

    public setAttachments(attachments: any[]): IMessageBuilder {
        this.msg.attachments = attachments;
        return this;
    }

    public getAttachments(): any[] {
        return this.msg.attachments || [];
    }

    public addBlocks(blocks: any): IMessageBuilder {
        const bl = blocks?.getBlocks ? blocks.getBlocks() : blocks;
        if (Array.isArray(bl)) {
            this.msg.blocks = [...(this.msg.blocks || []), ...bl];
        }
        return this;
    }

    public setBlocks(blocks: any): IMessageBuilder {
        const bl = blocks?.getBlocks ? blocks.getBlocks() : blocks;
        this.msg.blocks = Array.isArray(bl) ? bl : [];
        return this;
    }

    public getBlocks(): any[] {
        return this.msg.blocks || [];
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

    public getNotifier(): INotifier {
        return {
            notifyUser: async (user: IUser, message: IMessage): Promise<void> => {
                this.notifications.push({ user, message });
                if (message.id) this.messages.set(message.id, message);
            },
            notifyRoom: async (room: IRoom, message: IMessage): Promise<void> => {
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
            setViewError: async () => {},
            formatActionButton: () => ({} as any),
        } as any;
    }

    public getOAuthAppsModifier(): any { return {} as any; }
    public getScheduler(): any { return {} as any; }
}
