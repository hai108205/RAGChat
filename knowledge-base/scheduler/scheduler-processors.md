# Scheduler Processors

## Purpose

A processor is a task handler registered with the Rocket.Chat scheduler. It defines a job to be run — either once at a specific time, or on a recurring schedule. Processors are the building blocks for timed, background, and periodic work.

---

## Overview

A processor is defined by implementing the `IProcessor` interface. It has a unique `id`, an optional `startupSetting` that auto-schedules it upon registration, and a `processor()` method that runs when the job fires. Processors are registered in `extendConfiguration()` via `configuration.scheduler.registerProcessors()`.

The processor receives an `IJobContext` — a free-form data object populated from the schedule's `data` field — plus the standard accessors (`read`, `modify`, `http`, `persis`).

---

## When To Use

- Running cleanup tasks nightly
- Polling an external API on a cron schedule
- Sending scheduled reminders
- Delaying work (schedule once in the future)
- Any background task that should not block user interactions

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `IProcessor` | Processor definition | `id`, `startupSetting?`, `processor()` |
| `IJobContext` | Data passed to the processor | Free-form object (`{ [key: string]: any }`) |
| `IOnetimeStartup` | One-time startup config | `type`, `when`, `data?` |
| `IRecurringStartup` | Recurring startup config | `type`, `interval`, `skipImmediate?`, `data?` |
| `StartupType` | Enum | `ONETIME`, `RECURRING` |
| `ISchedulerExtend` | Registering processors | `registerProcessors(processors)` |
| `ISchedulerModify` | Scheduling jobs at runtime | `scheduleOnce()`, `scheduleRecurring()`, `cancelJob()`, `cancelAllJobs()` |

---

## IProcessor Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | Yes | Unique processor identifier. Must match the `id` used when scheduling a job |
| `startupSetting` | `IOnetimeStartup \| IRecurringStartup` | No | If provided, the processor is auto-scheduled when registered |
| `processor` | `(jobContext: IJobContext, read, modify, http, persis) => Promise<void>` | Yes | The function executed when the job runs |

---

## IJobContext Interface

| Property | Type | Description |
|----------|------|-------------|
| `[key: string]` | `any` | Free-form data object. Whatever was passed as `data` in the schedule definition |

```typescript
// Access job data
const processor = async (jobContext: IJobContext, read, modify, http, persis) => {
    const targetRoomId = jobContext.roomId;     // custom data field
    const message = jobContext.message;          // custom data field
    const retryCount = jobContext.retryCount;    // custom data field
};
```

---

## IOnetimeStartup Interface

Auto-schedule a one-time execution when the processor is registered:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | `StartupType.ONETIME` | Yes | Literally `StartupType.ONETIME` |
| `when` | `string \| Date` | Yes | When to run. A [human-interval](https://github.com/agenda/human-interval) string like `'2 hours'` or a `Date` object |
| `data` | `object` | No | Passed to the processor via `IJobContext` |

---

## IRecurringStartup Interface

Auto-schedule a recurring execution when the processor is registered:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | `StartupType.RECURRING` | Yes | Literally `StartupType.RECURRING` |
| `interval` | `string \| number` | Yes | Cron string, [human-interval](https://github.com/agenda/human-interval) string (e.g. `'5 minutes'`), or number of milliseconds |
| `skipImmediate` | `boolean` | No | If `true`, waits for the first interval before running. Default `false` — runs immediately on register |
| `data` | `object` | No | Passed to the processor via `IJobContext` |

---

## StartupType Enum

| Value | Enum Key | Description |
|-------|----------|-------------|
| `'onetime'` | `ONETIME` | Run once at a specific time after registration |
| `'recurring'` | `RECURRING` | Run repeatedly on an interval after registration |

---

## Typical Workflow

### 1. Define a Processor

```typescript
import { IProcessor, IJobContext, IOnetimeStartup, StartupType } from '@rocket.chat/apps-engine/definition/scheduler';
import { IRead, IModify, IHttp, IPersistence } from '@rocket.chat/apps-engine/definition/accessors';

export class CleanupProcessor implements IProcessor {
    public id = 'cleanup-processor';

    public startupSetting: IOnetimeStartup = {
        type: StartupType.ONETIME,
        when: '1 minute',           // Run 1 minute after registration
        data: {
            maxAge: 30,              // Custom data available in jobContext
        },
    };

    public async processor(
        jobContext: IJobContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<void> {
        const maxAge = jobContext.maxAge || 30;

        // Remove old records from persistence
        const records = await persis.readByAssociation(null);
        const cutoff = Date.now() - (maxAge * 24 * 60 * 60 * 1000);

        for (const record of records) {
            if (record.timestamp < cutoff) {
                await persis.removeByAssociation(null, record.id);
            }
        }

        console.log(`Cleanup complete: removed records older than ${maxAge} days`);
    }
}
```

### 2. Register the Processor

Processors are registered during initialization via `configuration.scheduler.registerProcessors()`:

```typescript
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IConfigurationExtend, IEnvironmentRead } from '@rocket.chat/apps-engine/definition/accessors';
import { CleanupProcessor } from './processors/CleanupProcessor';

export class MyApp extends App {
    protected async extendConfiguration(
        configuration: IConfigurationExtend,
        environmentRead: IEnvironmentRead
    ): Promise<void> {
        const startupIds = await configuration.scheduler.registerProcessors([
            new CleanupProcessor(),
        ]);

        // startupIds is an Array<string> of job IDs that were auto-scheduled
        // or void if no startupSetting was set
        if (startupIds) {
            this.getLogger().info('Scheduled startup jobs:', startupIds);
        }
    }
}
```

---

## Processor with No Startup Setting

A processor without `startupSetting` is registered but not auto-scheduled. It can be scheduled later at runtime via `ISchedulerModify`:

```typescript
export class ReportGenerator implements IProcessor {
    public id = 'report-generator';

    public async processor(
        jobContext: IJobContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<void> {
        const roomId = jobContext.roomId;
        const format = jobContext.format || 'pdf';

        // Generate and post the report
        const appUser = await read.getUserReader().getAppUser();
        const room = await read.getRoomReader().getById(roomId);

        if (room) {
            const builder = modify.getCreator().startMessage()
                .setRoom(room)
                .setSender(appUser)
                .setText(`Report generated (${format})`);

            await modify.getCreator().finish(builder);
        }
    }
}
```

---

## Complete Example

```typescript
import { App } from '@rocket.chat/apps-engine/definition/App';
import {
    IConfigurationExtend,
    IEnvironmentRead,
    IRead,
    IModify,
    IHttp,
    IPersistence,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
    IProcessor,
    IJobContext,
    IRecurringStartup,
    StartupType,
} from '@rocket.chat/apps-engine/definition/scheduler';

// Recurring processor: health check every 5 minutes
class HealthCheckProcessor implements IProcessor {
    public id = 'health-check';

    public startupSetting: IRecurringStartup = {
        type: StartupType.RECURRING,
        interval: '5 minutes',        // Human-interval format
        skipImmediate: false,          // Run immediately on register
        data: {
            url: 'https://api.example.com/health',
        },
    };

    public async processor(
        jobContext: IJobContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<void> {
        const url = jobContext.url;

        try {
            const response = await http.get(url);

            if (response.statusCode !== 200) {
                await this.alertDown(url, read, modify);
            }
        } catch (error) {
            await this.alertDown(url, read, modify);
        }
    }

    private async alertDown(
        url: string,
        read: IRead,
        modify: IModify
    ): Promise<void> {
        const appUser = await read.getUserReader().getAppUser();
        const room = await read.getRoomReader().getByName('general');

        if (room) {
            const builder = modify.getCreator().startMessage()
                .setRoom(room)
                .setSender(appUser)
                .setText(`ALERT: ${url} appears to be down!`);

            await modify.getCreator().finish(builder);
        }
    }
}

// App registration
export class MonitorApp extends App {
    protected async extendConfiguration(
        configuration: IConfigurationExtend,
        environmentRead: IEnvironmentRead
    ): Promise<void> {
        await configuration.scheduler.registerProcessors([
            new HealthCheckProcessor(),
        ]);
    }
}
```

---

## Best Practices

- **Use unique `id` values** — the `id` is how jobs are identified for cancellation.
- **Use `startupSetting` for auto-scheduled jobs** — convenient for recurring maintenance tasks.
- **Use `skipImmediate: true` for long-interval recurring jobs** — avoid running at an inconvenient time.
- **Pass data via the `data` field** — don't hardcode configuration inside the processor; it makes reuse harder.
- **Handle errors inside `processor()`** — an uncaught exception might cause the scheduler to lose track of the job.
- **Use human-interval strings for readability** — `'2 hours'`, `'5 minutes'`, `'1 week'` are clearer than millisecond values.
- **Log job execution start/end** — helps with debugging scheduling issues.

---

## Common Mistakes

- **Not handling errors in `processor()`** — unhandled rejections can stop recurring jobs.
- **Using the same `id` for two processors** — job scheduling relies on unique processor IDs.
- **Blocking the processor for too long** — the processor runs asynchronously, but extremely long operations may overlap.
- **Setting `startupSetting` without understanding timing** — a `ONETIME` with `'0 seconds'` runs almost immediately.
- **Assuming `jobContext` always has data** — it is an empty object if no `data` was provided.

---

## Related Topics

- [Scheduler Jobs](./scheduler-jobs.md)
- [IPersistence Accessor](../accessors/i-persistence-accessor.md)
- [IHttp Accessor](../accessors/i-http-accessor.md)
- [App Configuration](../app/app-configuration.md)
