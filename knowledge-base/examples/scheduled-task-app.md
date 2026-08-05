# Scheduled Task App

## Architecture

A scheduled job app demonstrating the full scheduler lifecycle: registering a processor via `ISchedulerExtend`, scheduling a one-time job using `onInstall()`, scheduling and managing recurring jobs via a slash command, implementing `IProcessor` with a `IJobContext` that carries custom data, tracking job execution with persistence, and canceling jobs via `ISchedulerModify`.

**Key concept**: Processors are registered once at configuration time. Jobs are scheduled at runtime -- one-time jobs fire once at a given time, recurring jobs fire on a repeating interval. The same processor can be scheduled many times with different `data` payloads. Jobs are identified by processor `id`; cancel them by the returned job ID.

## Folder Structure

```
scheduled-task-app/
  app.json
  app.ts
  commands/
    ScheduleCommands.ts
  processors/
    DailyReportProcessor.ts
```

## Flow

1. App registers `DailyReportProcessor` in `extendConfiguration()` via `configuration.scheduler.registerProcessors()`
2. App schedules a one-time "first-run" job in `onInstall()` via `modify.getScheduler().scheduleOnce()`
3. App registers a `/schedule` slash command for users to start/stop recurring jobs
4. User types `/schedule start daily` -- executor calls `modify.getScheduler().scheduleRecurring()` with cron `'0 9 * * *'`
5. Every day at 9 AM, the engine invokes `DailyReportProcessor.processor(jobContext, read, modify, http, persis)`
6. Processor reads `jobContext` for room/user data passed at scheduling time
7. Processor posts a daily report message to the target room
8. Processor persists a run counter via `IPersistence`
9. User types `/schedule stop` -- executor calls `scheduler.cancelAllJobs()` and removes from persistence
10. On uninstall, `onUninstall()` calls `scheduler.cancelAllJobs()` for cleanup

## Implementation

### app.json

```json
{
    "id": "e4d5f6a7-b8c9-0123-defa-123456789012",
    "version": "1.0.0",
    "requiredApiVersion": "^2.4.0",
    "iconFile": "icon.png",
    "author": {
        "name": "Your Name",
        "homepage": "https://example.com",
        "support": "https://example.com/support"
    },
    "name": "Daily Report",
    "nameSlug": "daily-report",
    "classFile": "app.ts",
    "description": "Sends automated daily reports with run tracking.",
    "implements": []
}
```

### processors/DailyReportProcessor.ts

```typescript
import {
    IProcessor,
    IJobContext,
} from '@rocket.chat/apps-engine/definition/scheduler';
import {
    IRead,
    IModify,
    IHttp,
    IPersistence,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
    RocketChatAssociationModel,
    RocketChatAssociationRecord,
} from '@rocket.chat/apps-engine/definition/metadata';

export class DailyReportProcessor implements IProcessor {
    public id = 'daily-report';

    public async processor(
        jobContext: IJobContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence,
    ): Promise<void> {
        const { targetRoom, reportType, initiatedBy } = jobContext;

        if (!targetRoom) {
            return;
        }

        const appUser = await read.getUserReader().getAppUser();
        const room = await read.getRoomReader().getById(targetRoom);

        if (!room) {
            return;
        }

        // Read and increment the run counter
        const counter = await this.incrementRunCounter(persis);

        // Read the current online user count for the room
        let memberCount = 0;
        try {
            const members = await read.getRoomReader().getMembers(room.id);
            memberCount = members ? members.length : 0;
        } catch {
            // getMembers may not be available in all deployments
        }

        // Build the report message
        const now = new Date();
        const formattedTime = now.toLocaleString();
        const lines: string[] = [
            `**Daily Report -- ${reportType || 'Standard'}**`,
            `Report #${counter} | ${formattedTime}`,
            '',
            `Room: #${room.displayName || room.id}`,
            `Members: ${memberCount}`,
            '',
            initiatedBy
                ? `Scheduled by: @${initiatedBy}`
                : 'Scheduled automatically',
        ];

        const builder = modify.getCreator().startMessage()
            .setRoom(room)
            .setSender(appUser)
            .setText(lines.join('\n'));

        await modify.getCreator().finish(builder);
    }

    private async incrementRunCounter(
        persis: IPersistence,
    ): Promise<number> {
        const assoc = new RocketChatAssociationRecord(
            RocketChatAssociationModel.MISC,
            'daily-report-counter',
        );

        // Try to read the existing counter
        const persisRead = persis.getReadMethods
            ? persis.getReadMethods()
            : null;

        let currentCount = 0;

        if (persisRead) {
            const items = await persisRead.readByAssociation(assoc);
            if (items.length > 0) {
                currentCount = (items[0].data as any).count || 0;
            }
        }

        const newCount = currentCount + 1;

        await persis.updateByAssociation(
            assoc,
            { count: newCount, lastRun: new Date().toISOString() },
            true, // upsert
        );

        return newCount;
    }
}
```

### commands/ScheduleCommands.ts

```typescript
import {
    ISlashCommand,
    SlashCommandContext,
} from '@rocket.chat/apps-engine/definition/slashcommands';
import {
    IRead,
    IModify,
    IHttp,
    IPersistence,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
    RocketChatAssociationModel,
    RocketChatAssociationRecord,
} from '@rocket.chat/apps-engine/definition/metadata';

export class ScheduleCommands implements ISlashCommand {
    public command = 'schedule';
    public i18nParamsExample = 'start daily | stop | status';
    public i18nDescription = 'Manage scheduled daily reports';
    public providesPreview = false;

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence,
    ): Promise<void> {
        const args = context.getArguments();
        const sender = context.getSender();
        const room = context.getRoom();
        const appUser = await read.getUserReader().getAppUser();

        if (args.length === 0) {
            await this.sendHelp(read, modify, room);
            return;
        }

        const subcommand = args[0].toLowerCase();

        switch (subcommand) {
            case 'start': {
                const reportType =
                    args.length > 1 ? args.slice(1).join(' ') : 'Standard';

                const scheduler = modify.getScheduler();

                // Cancel any existing recurring jobs for this processor
                await scheduler.cancelAllJobs();

                // Schedule a new recurring job -- daily at 9 AM
                const jobId = await scheduler.scheduleRecurring({
                    id: 'daily-report',
                    interval: '0 9 * * *', // Cron: every day at 9:00 AM
                    skipImmediate: false,
                    data: {
                        targetRoom: room.id,
                        reportType,
                        initiatedBy: sender.username,
                    },
                });

                // Persist the schedule state
                const assoc = new RocketChatAssociationRecord(
                    RocketChatAssociationModel.ROOM,
                    room.id,
                );
                await persis.updateByAssociation(
                    assoc,
                    {
                        active: true,
                        reportType,
                        jobId: jobId || 'unknown',
                        startedBy: sender.username,
                        startedAt: new Date().toISOString(),
                    },
                    true,
                );

                const builder = modify.getCreator().startMessage()
                    .setRoom(room)
                    .setSender(appUser)
                    .setText(
                        `Daily report scheduled (type: "${reportType}"). ` +
                        `Reports will be sent every day at 9:00 AM. ` +
                        (jobId ? `Job ID: ${jobId}` : ''),
                    );

                await modify.getCreator().finish(builder);
                break;
            }

            case 'stop': {
                const scheduler = modify.getScheduler();

                // Cancel all jobs for this App
                await scheduler.cancelAllJobs();

                // Clear persisted state
                const assoc = new RocketChatAssociationRecord(
                    RocketChatAssociationModel.ROOM,
                    room.id,
                );
                await persis.updateByAssociation(
                    assoc,
                    { active: false, stoppedBy: sender.username },
                    true,
                );

                const builder = modify.getCreator().startMessage()
                    .setRoom(room)
                    .setSender(appUser)
                    .setText('All scheduled reports have been stopped.');

                await modify.getCreator().finish(builder);
                break;
            }

            case 'status': {
                const persisRead = read.getPersistenceReader();
                const assoc = new RocketChatAssociationRecord(
                    RocketChatAssociationModel.ROOM,
                    room.id,
                );
                const items = await persisRead.readByAssociation(assoc);

                let statusText: string;
                if (items.length === 0) {
                    statusText = 'No schedules configured for this room.';
                    break;
                }

                const data = items[0].data as any;
                statusText = data.active
                    ? `Reports active: type "${data.reportType}", started by @${data.startedBy} on ${data.startedAt}. Job ID: ${data.jobId}`
                    : `Reports stopped by @${data.stoppedBy}.`;

                const builder = modify.getCreator().startMessage()
                    .setRoom(room)
                    .setSender(appUser)
                    .setText(statusText);

                await modify.getCreator().finish(builder);
                break;
            }

            default: {
                await this.sendHelp(read, modify, room);
                break;
            }
        }
    }

    private async sendHelp(
        read: IRead,
        modify: IModify,
        room: any,
    ): Promise<void> {
        const appUser = await read.getUserReader().getAppUser();

        const builder = modify.getCreator().startMessage()
            .setRoom(room)
            .setSender(appUser)
            .setText(
                '**Schedule Commands**\n' +
                '`/schedule start [report type]` -- Start daily reports\n' +
                '`/schedule stop` -- Stop all scheduled reports\n' +
                '`/schedule status` -- Check current schedule status',
            );

        await modify.getCreator().finish(builder);
    }
}
```

### app.ts

```typescript
import {
    IAppAccessors,
    IConfigurationExtend,
    IEnvironmentRead,
    ILogger,
    IRead,
    IHttp,
    IPersistence,
    IModify,
    IAppInstallationContext,
    IAppUninstallationContext,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';

import { DailyReportProcessor } from './processors/DailyReportProcessor';
import { ScheduleCommands } from './commands/ScheduleCommands';

export class DailyReportApp extends App {
    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    protected async extendConfiguration(
        configuration: IConfigurationExtend,
        environmentRead: IEnvironmentRead,
    ): Promise<void> {
        // Register the processor -- this makes it available for scheduling
        await configuration.scheduler.registerProcessors([
            new DailyReportProcessor(),
        ]);

        // Register the slash command for managing schedules
        await configuration.slashCommands.provideSlashCommand(
            new ScheduleCommands(),
        );
    }

    public async onInstall(
        context: IAppInstallationContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        // Schedule a one-time "welcome" job 1 minute after install
        await modify.getScheduler().scheduleOnce({
            id: 'daily-report',
            when: '1 minute',
            data: {
                targetRoom: 'GENERAL',
                reportType: 'Welcome',
                initiatedBy: 'system',
            },
        });

        this.getLogger().log(
            'DailyReportApp installed. Welcome report scheduled.',
        );
    }

    public async onUninstall(
        context: IAppUninstallationContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify,
    ): Promise<void> {
        // Cancel all running jobs on uninstall to prevent orphan jobs
        await modify.getScheduler().cancelAllJobs();

        this.getLogger().log(
            'DailyReportApp uninstalled. All jobs cancelled.',
        );
    }
}
```

## Best Practices

- **Register processors once in `extendConfiguration()`**. The processor `id` is the namespace for scheduling. All `scheduleOnce` and `scheduleRecurring` calls reference it.
- **Schedule jobs at runtime**, not in `extendConfiguration()` (unless using `startupSetting`). Use lifecycle hooks (`onInstall`, `onEnable`) or slash command executors.
- **Use `startupSetting` on `IProcessor`** for declarative auto-startup. Set `type: StartupType.ONETIME` with `when` or `type: StartupType.RECURRING` with `interval`. The engine auto-schedules on install.
- **Pass context via `data`**. Room ID, user ID, report type -- anything the processor needs at execution time. Do not rely on global state or closure variables.
- **Use `modify.getScheduler()` for runtime scheduling**. This returns `ISchedulerModify` with `scheduleOnce()`, `scheduleRecurring()`, `cancelJob()`, `cancelAllJobs()`.
- **Store job IDs returned from schedule calls**. `scheduleOnce()` and `scheduleRecurring()` can return `void | string`. If you get a string, keep it for precise cancellation.
- **Cancel all jobs in `onUninstall()`**. Orphan jobs may still fire after uninstall, causing errors. Always clean up.
- **Use persistence to track job state**. Users want to know if a recurring job is active, when it last ran, and who set it up.
- **Use cron expressions for precise schedules**. `'0 9 * * *'` (daily at 9 AM), `'0 9 * * 1'` (Monday 9 AM). Combine with `skipImmediate: true` for cron-based schedules to avoid running immediately.
- **Handle the `getRoomReader().getMembers()` fallback**. Not all Rocket.Chat deployments expose member counts. Always wrap in try/catch.

## Related Topics

- [Scheduler Processors](../scheduler/scheduler-processors.md)
- [Scheduler Jobs](../scheduler/scheduler-jobs.md)
- [App Lifecycle](../app/app-lifecycle.md)
- [Slash Command Definition](../commands/slash-command-definition.md)
- [IPersistence Accessor](../accessors/i-persistence-accessor.md)
- [App Configuration](../app/app-configuration.md)
