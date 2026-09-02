import {
    IEnvironmentRead,
    IRead,
    IRoomRead,
    ISettingRead,
    IUserRead,
    IUploadRead,
    IPersistenceRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IRoom, RoomType } from '@rocket.chat/apps-engine/definition/rooms';
import { IUser, UserType } from '@rocket.chat/apps-engine/definition/users';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';

export class MockRead implements IRead {
    private settings: Map<string, any> = new Map();
    private users: Map<string, IUser> = new Map();
    private rooms: Map<string, IRoom> = new Map();
    private uploadBuffers: Map<string, Buffer> = new Map();
    public persistenceStore: Map<string, any[]> = new Map();

    constructor() {
        // Defaults for RAGChat App
        this.settings.set('backend-url', 'http://localhost:8000');
        this.settings.set('integration-token', 'test-rocketchat-integration-token');
        this.settings.set('default-model', 'api-ai.box/deepseek-v4-flash');

        const botUser: IUser = {
            id: 'ragchat-bot-id',
            username: 'ragchat.bot',
            name: 'RAGChat Bot',
            roles: ['bot', 'app'],
            type: UserType.BOT,
            status: 'online',
            active: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            emails: [],
            isEnabled: true,
            isLocked: false,
        };
        this.users.set('ragchat-bot-id', botUser);
        this.users.set('ragchat.bot', botUser);

        const testUser: IUser = {
            id: 'test-user-id',
            username: 'test.user',
            name: 'Test User',
            roles: ['user'],
            type: UserType.USER,
            status: 'online',
            active: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            emails: [],
            isEnabled: true,
            isLocked: false,
        };
        this.users.set('test-user-id', testUser);
        this.users.set('test.user', testUser);

        const testRoom: IRoom = {
            id: 'test-room-id',
            displayName: 'General Channel',
            slugifiedName: 'general',
            type: RoomType.CHANNEL,
            creator: testUser,
            userIds: ['test-user-id', 'ragchat-bot-id'],
            isDefault: true,
            isReadOnly: false,
            displaySystemForms: false,
            updatedAt: new Date(),
            createdAt: new Date(),
        };
        this.rooms.set('test-room-id', testRoom);
        this.rooms.set('GENERAL', testRoom);

        const dmRoom: IRoom = {
            id: 'test-dm-room-id',
            displayName: 'DM with Bot',
            slugifiedName: 'dm-ragchat-bot',
            type: RoomType.DIRECT_MESSAGE,
            creator: testUser,
            userIds: ['test-user-id', 'ragchat-bot-id'],
            isDefault: false,
            isReadOnly: false,
            displaySystemForms: false,
            updatedAt: new Date(),
            createdAt: new Date(),
        };
        this.rooms.set('test-dm-room-id', dmRoom);
    }

    public setSetting(id: string, value: any) {
        this.settings.set(id, value);
    }

    public setUser(idOrUsername: string, user: IUser) {
        this.users.set(idOrUsername, user);
        if (user.id) this.users.set(user.id, user);
        if (user.username) this.users.set(user.username, user);
    }

    public setRoom(idOrName: string, room: IRoom) {
        this.rooms.set(idOrName, room);
        if (room.id) this.rooms.set(room.id, room);
        if (room.displayName) this.rooms.set(room.displayName, room);
        if (room.slugifiedName) this.rooms.set(room.slugifiedName, room);
    }

    public setUploadBuffer(id: string, buffer: Buffer) {
        this.uploadBuffers.set(id, buffer);
    }

    public getEnvironmentReader(): IEnvironmentRead {
        return {
            getSettings: (): ISettingRead => ({
                getValueById: async (id: string) => this.settings.get(id),
                getSetting: async (id: string) => ({
                    id,
                    type: 0,
                    packageValue: this.settings.get(id),
                    value: this.settings.get(id),
                    required: false,
                    public: false,
                    i18nLabel: id,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                } as any),
                getAllSettings: async () => [] as any,
                count: async () => this.settings.size,
            }),
            getServerSettings: () => ({} as any),
            getEnvironmentVariables: () => ({} as any),
        };
    }

    public getUserReader(): IUserRead {
        return {
            getById: async (id: string) => this.users.get(id) || null,
            getByUsername: async (username: string) => this.users.get(username) || null,
            getAppUser: async () => this.users.get('ragchat-bot-id') || null,
            getUserUnreadMessageCount: async () => 0,
        };
    }

    public getRoomReader(): IRoomRead {
        return {
            getById: async (id: string) => this.rooms.get(id) || null,
            getByName: async (name: string) => this.rooms.get(name) || null,
            getDirectByUsernames: async (usernames: string[]) => {
                for (const room of this.rooms.values()) {
                    if (room.type === RoomType.DIRECT_MESSAGE) return room;
                }
                return null;
            },
            getMembers: async () => Array.from(this.users.values()),
            getMessages: async () => [],
            getModerators: async () => [],
            getOwners: async () => [],
            getLeaders: async () => [],
            getUserUnreadMessageCount: async () => 0,
            getThreads: async () => [],
        };
    }

    public getPersistenceReader(): IPersistenceRead {
        const getKey = (assoc: any) => {
            const model = typeof assoc?.getModel === 'function' ? assoc.getModel() : assoc?.model || '';
            const id = typeof assoc?.getID === 'function' ? assoc.getID() : typeof assoc?.getId === 'function' ? assoc.getId() : assoc?.id || '';
            return `${model}_${id}`;
        };

        return {
            read: async (association: RocketChatAssociationRecord) => {
                const key = getKey(association);
                return this.persistenceStore.get(key) || [];
            },
            readByAssociation: async (association: RocketChatAssociationRecord) => {
                const key = getKey(association);
                return this.persistenceStore.get(key) || [];
            },
            readByAssociations: async (associations: RocketChatAssociationRecord[]) => {
                const results: any[] = [];
                for (const assoc of associations) {
                    const key = getKey(assoc);
                    const items = this.persistenceStore.get(key) || [];
                    results.push(...items);
                }
                return results;
            },
        };
    }

    public getUploadReader(): IUploadRead {
        return {
            getBufferById: async (id: string) => this.uploadBuffers.get(id) || Buffer.from(''),
            getBuffer: async (upload: any) => this.uploadBuffers.get(upload?.id) || Buffer.from(''),
            getById: async (id: string) => ({ id } as any),
        };
    }

    private messages: Map<string, any> = new Map();

    public setMessage(id: string, msg: any) {
        this.messages.set(id, msg);
    }

    public getMessageReader(): any {
        return {
            getById: async (id: string) => this.messages.get(id) || null,
            getRoomMessages: async () => Array.from(this.messages.values()),
            getSenderMessages: async () => [],
            getThreadMessages: async () => [],
        };
    }
    public getLivechatReader(): any { return {} as any; }
    public getModify(): any { return {} as any; }
    public getNotifier(): any { return {} as any; }
    public getOAuthAppsReader(): any { return {} as any; }
    public getRoleReader(): any { return {} as any; }
    public getThreadReader(): any { return {} as any; }
    public getVideoConferenceRead(): any { return {} as any; }
}
