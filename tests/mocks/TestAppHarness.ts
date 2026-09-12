import type { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { AppMethod } from '@rocket.chat/apps-engine/definition/metadata';
import type { ILogger } from '@rocket.chat/apps-engine/definition/accessors';
import { RagChatApp } from '../../RagChatApp';
import { MockRead } from './MockRead';
import { MockModify } from './MockModify';
import { MockHttp } from './MockHttp';
import { MockPersistence } from './MockPersistence';

export class MockLogger implements ILogger {
    public method: `${AppMethod}` = AppMethod._CONSTRUCTOR;
    public debugs: any[] = [];
    public infos: any[] = [];
    public warns: any[] = [];
    public errors: any[] = [];
    public allLogs: any[] = [];
    private startTime: Date = new Date();
    private endTime: Date = new Date();

    debug(...args: any[]): void { this.debugs.push(args); this.allLogs.push(['debug', ...args]); }
    info(...args: any[]): void { this.infos.push(args); this.allLogs.push(['info', ...args]); }
    warn(...args: any[]): void { this.warns.push(args); this.allLogs.push(['warn', ...args]); }
    error(...args: any[]): void { this.errors.push(args); this.allLogs.push(['error', ...args]); }
    log(...args: any[]): void { this.infos.push(args); this.allLogs.push(['info', ...args]); }
    success(...args: any[]): void { this.infos.push(args); this.allLogs.push(['success', ...args]); }
    getEntries(): any[] { return []; }
    getMethod(): `${AppMethod}` { return this.method; }
    getTotalTime(): number { return 0; }
    getStartTime(): Date { return this.startTime; }
    getEndTime(): Date { return this.endTime; }
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
        classFile: 'RagChatApp.ts',
        iconFile: 'icon.png',
        implements: [],
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

export type TestHarness = ReturnType<typeof createTestAppHarness>;
