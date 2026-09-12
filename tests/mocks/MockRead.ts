import type {
    ICloudWorkspaceRead,
    IEnvironmentRead,
    IEnvironmentalVariableRead,
    IExperimentalRead,
    ILivechatRead,
    IMessageRead,
    INotifier,
    IPersistenceRead,
    IRead,
    IRoleRead,
    IRoomRead,
    IServerSettingRead,
    ISettingRead,
    IUploadRead,
    IUserRead,
    IVideoConferenceRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import type { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { RoomType } from '@rocket.chat/apps-engine/definition/rooms';
import type { IUser } from '@rocket.chat/apps-engine/definition/users';
import { UserStatusConnection, UserType } from '@rocket.chat/apps-engine/definition/users';
import type { RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import type { ISetting } from '@rocket.chat/apps-engine/definition/settings';
import { SettingType } from '@rocket.chat/apps-engine/definition/settings';

export class MockRead implements IRead {
    private settings: Map<string, any> = new Map();
    private users: Map<string, IUser> = new Map();
    private rooms: Map<string, IRoom> = new Map();
    private uploadBuffers: Map<string, Buffer> = new Map();
    public persistenceStore: Map<string, any[]> = new Map();
    private messages: Map<string, any> = new Map();

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
            statusConnection: UserStatusConnection.ONLINE,
            isEnabled: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastLoginAt: new Date(),
            utcOffset: 0,
            emails: [],
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
            statusConnection: UserStatusConnection.ONLINE,
            isEnabled: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastLoginAt: new Date(),
            utcOffset: 0,
            emails: [],
        };
        this.users.set('test-user-id', testUser);
        this.users.set('test.user', testUser);

        const testRoom: IRoom = {
            id: 'test-room-id',
            displayName: 'General Channel',
            slugifiedName: 'general',
            type: RoomType.CHANNEL,
            creator: testUser,
            usernames: ['test.user', 'ragchat.bot'],
            userIds: ['test-user-id', 'ragchat-bot-id'],
            isDefault: true,
            isReadOnly: false,
            displaySystemMessages: false,
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
            usernames: ['test.user', 'ragchat.bot'],
            userIds: ['test-user-id', 'ragchat-bot-id'],
            isDefault: false,
            isReadOnly: false,
            displaySystemMessages: false,
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

    public setMessage(id: string, msg: any) {
        this.messages.set(id, msg);
    }

    public getEnvironmentReader(): IEnvironmentRead {
        return {
            getSettings: (): ISettingRead => ({
                getValueById: async (id: string) => this.settings.get(id),
                getById: async (id: string): Promise<ISetting> => ({
                    id,
                    type: SettingType.STRING,
                    packageValue: this.settings.get(id),
                    value: this.settings.get(id),
                    required: false,
                    public: false,
                    i18nLabel: id,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    section: '',
                    hidden: false,
                    i18nDescription: '',
                }),
            }),
            getServerSettings: () => ({} as IServerSettingRead),
            getEnvironmentVariables: () => ({} as IEnvironmentalVariableRead),
        };
    }

    public getUserReader(): IUserRead {
        return {
            getById: async (id: string): Promise<IUser> => {
                const user = this.users.get(id);
                if (!user) throw new Error(`User not found: ${id}`);
                return user;
            },
            getByUsername: async (username: string): Promise<IUser> => {
                const user = this.users.get(username);
                if (!user) throw new Error(`User not found: ${username}`);
                return user;
            },
            getAppUser: async () => this.users.get('ragchat-bot-id'),
            getUserUnreadMessageCount: async () => 0,
            getBySipExtension: async () => undefined,
            getUserRoomIds: async () => [],
        };
    }

    public getRoomReader(): IRoomRead {
        return {
            getById: async (id: string): Promise<IRoom | undefined> => this.rooms.get(id),
            getByName: async (name: string): Promise<IRoom | undefined> => this.rooms.get(name),
            getCreatorUserById: async (id: string): Promise<IUser | undefined> => {
                const room = this.rooms.get(id);
                return room?.creator;
            },
            getCreatorUserByName: async (name: string): Promise<IUser | undefined> => {
                const room = this.rooms.get(name);
                return room?.creator;
            },
            getDirectByUsernames: async (usernames: string[]): Promise<IRoom> => {
                for (const room of this.rooms.values()) {
                    if (room.type === RoomType.DIRECT_MESSAGE) return room;
                }
                throw new Error('Direct room not found');
            },
            getMembers: async () => Array.from(this.users.values()),
            getAllRooms: async () => Array.from(this.rooms.values()) as any,
            getMessages: async () => Array.from(this.messages.values()),
            getModerators: async () => [],
            getOwners: async () => [],
            getLeaders: async () => [],
            getUnreadByUser: async () => [],
            getUserUnreadMessageCount: async () => 0,
        };
    }

    public getPersistenceReader(): IPersistenceRead {
        const getKey = (assoc: any) => {
            const model = typeof assoc?.getModel === 'function' ? assoc.getModel() : assoc?.model || '';
            const id = typeof assoc?.getID === 'function' ? assoc.getID() : typeof assoc?.getId === 'function' ? assoc.getId() : assoc?.id || '';
            return `${model}_${id}`;
        };

        return {
            read: async (id: string): Promise<object> => {
                const results = this.persistenceStore.get(id) || [];
                return results[0] || {};
            },
            readByAssociation: async (association: RocketChatAssociationRecord): Promise<Array<object>> => {
                const key = getKey(association);
                return this.persistenceStore.get(key) || [];
            },
            readByAssociations: async (associations: RocketChatAssociationRecord[]): Promise<Array<object>> => {
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

    public getMessageReader(): IMessageRead {
        return {
            getById: async (id: string) => this.messages.get(id) || null,
            getRoomMessages: async () => Array.from(this.messages.values()),
            getSenderMessages: async () => [],
            getThreadMessages: async () => [],
            getUnreadUserMessages: async () => [],
            getUserUnreadMessageCount: async () => 0,
        } as any;
    }

    public getThreadReader(): any {
        return {
            getById: async (id: string) => this.messages.get(id) || null,
            getMessages: async () => [],
            getAllThreadMessages: async () => [],
            getThreadParticipants: async () => [],
        };
    }

    public getNotifier(): INotifier { return {} as any; }
    public getLivechatReader(): ILivechatRead { return {} as any; }
    public getCloudWorkspaceReader(): ICloudWorkspaceRead { return {} as any; }
    public getVideoConferenceReader(): IVideoConferenceRead { return {} as any; }
    public getOAuthAppsReader(): any { return {} as any; }
    public getRoleReader(): IRoleRead { return {} as any; }
    public getContactReader(): any { return {} as any; }
    public getExperimentalReader(): IExperimentalRead { return {} as any; }
}
