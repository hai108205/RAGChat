import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { ILogger } from '@rocket.chat/apps-engine/definition/accessors';
import { RagChatApp } from '../../RagChatApp';
import { MockRead } from './MockRead';
import { MockModify } from './MockModify';
import { MockHttp } from './MockHttp';
import { MockPersistence } from './MockPersistence';

export class MockLogger implements ILogger {
    public debugs: any[] = [];
    public infos: any[] = [];
    public warns: any[] = [];
    public errors: any[] = [];
    public allLogs: any[] = [];

    debug(...args: any[]): void { this.debugs.push(args); this.allLogs.push(['debug', ...args]); }
    info(...args: any[]): void { this.infos.push(args); this.allLogs.push(['info', ...args]); }
    warn(...args: any[]): void { this.warns.push(args); this.allLogs.push(['warn', ...args]); }
    error(...args: any[]): void { this.errors.push(args); this.allLogs.push(['error', ...args]); }
    log(...args: any[]): void { this.infos.push(args); this.allLogs.push(['info', ...args]); }
    getMethod(): any { return () => {}; }
    getMethods(): any { return {}; }
    getTotalTime(): number { return 0; }
    getStartTime(): Date { return new Date(); }
    getEndTime(): Date { return new Date(); }
}

export function createTestAppHarness() {
    const mockRead = new MockRead();
    const mockModify = new MockModify();
    const mockHttp = new MockHttp();
    const mockPersistence = new MockPersistence(mockRead);
    const mockLogger = new MockLogger();

    const appInfo: IAppInfo = {
        id: 'ragchat-app-test-id',
        name: 'RAGChat Test App',
        nameSlug: 'ragchat-test-app',
        version: '1.0.0',
        description: 'Test harness app for RAGChat regression testing',
        requiredApiVersion: '^1.44.0',
        author: {
            name: 'RAGChat Team',
            homepage: 'https://github.com/hai108205/RAGChat',
            support: 'support@example.com',
        },
    };

    const accessors = {
        environmentRead: mockRead.getEnvironmentReader(),
        environmentWrite: {} as any,
        reader: mockRead,
        modifier: mockModify,
        http: mockHttp,
        providedApiEndpoints: [],
        persistence: mockPersistence,
        ui: mockModify.getUiController(),
        slashCommands: {} as any,
        configurationModify: {} as any,
        configurationExtend: {} as any,
    };

    const app = new RagChatApp(appInfo, mockLogger, accessors as any);

    return {
        app,
        mockRead,
        mockModify,
        mockHttp,
        mockPersistence,
        mockLogger,
    };
}
