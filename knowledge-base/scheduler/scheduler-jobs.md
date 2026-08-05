# Scheduler Jobs

## Purpose

Scheduler jobs are runtime schedules that tell the Rocket.Chat scheduler when to run a registered processor. You can schedule one-time jobs (run once at a specific time) or recurring jobs (run repeatedly on an interval). Jobs are managed through the `ISchedulerModify` accessor.

---

## Overview

After you have registered one or more processors via `configuration.scheduler.registerProcessors()`, you can schedule them to run at runtime using the `ISchedulerModify` accessor, available through `modify.getScheduler()`. There are two job types:

- **One-Time** (`IOnetimeSchedule`): Runs a processor once at a specified time
- **Recurring** (`IRecurringSchedule`): Runs a processor on a repeating interval

The scheduler supports cancellation — you can cancel a specific job by its ID or cancel all jobs belonging to your App.

---

## When To Use

- Scheduling a follow-up action an hour after a user command
- Sending a daily summary report via cron
- Scheduling a reminder for a specific date/time
- Cleaning up old data every night
- Polling an external API every N minutes
- Delaying a message or action

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `IOnetimeSchedule` | One-time job definition | `id`, `when`, `data?` |
| `IRecurringSchedule` | Recurring job definition | `id`, `interval`, `skipImmediate?`, `data?` |
| `ISchedulerModify` | Scheduling and managing jobs | `scheduleOnce()`, `scheduleRecurring()`, `cancelJob()`, `cancelAllJobs()` |
| `IProcessor` | The handler that runs | `id` (must match schedule's `id`), `processor()` |

---

## IOnetimeSchedule Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | Yes | Must match the `id` of a registered `IProcessor` |
| `when` | `string \| Date` | Yes | When to run. A [human-interval](https://github.com/agenda/human-interval) string (`'2 hours'`, `'tomorrow at 9am'`) or a `Date` object |
| `data` | `object` | No | Custom data passed to the processor via `IJobContext` |

---

## IRecurringSchedule Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | Yes | Must match the `id` of a registered `IProcessor` |
| `interval` | `string \| number` | Yes | How often to run. Cron expression, [human-interval](https://github.com/agenda/human-interval) string (`'5 minutes'`), or milliseconds |
| `skipImmediate` | `boolean` | No | If `true`, waits for the first interval before the first run. Default `false` (runs immediately) |
| `data` | `object` | No | Custom data passed to the processor via `IJobContext` |

---

## ISchedulerModify Interface

| Method | Signature | Description |
|--------|-----------|-------------|
| `scheduleOnce()` | `(job: IOnetimeSchedule) => Promise<void \| string>` | Schedule a registered processor to run once |
| `scheduleRecurring()` | `(job: IRecurringSchedule) => Promise<void \| string>` | Schedule a registered processor to run on a recurring interval |
| `cancelJob()` | `(jobId: string) => Promise<void>` | Cancel a specific running job by its job ID (returned from scheduleOnce/scheduleRecurring) |
| `cancelAllJobs()` | `() => Promise<void>` | Cancel all running jobs from your App |

---

## Typical Workflow

### 1. Register a Processor (in `extendConfiguration`)

```typescript
class RemindProcessor implements IProcessor {
    public id = 'remind-processor';

    public async processor(
        jobContext: IJobContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<void> {
        // jobContext contains the data passed when scheduling
        const message = jobContext.message;
        const roomId = jobContext.roomId;
        const userId = jobContext.userId;

        const appUser = await read.getUserReader().getAppUser();
        const room = await read.getRoomReader().getById(roomId);

        if (room) {
            const builder = modify.getCreator().startMessage()
                .setRoom(room)
                .setSender(appUser)
                .setText(`Reminder for @${userId}: ${message}`);

            await modify.getCreator().finish(builder);
        }
    }
}

// Register
protected async extendConfiguration(configuration: IConfigurationExtend): Promise<void> {
    await configuration.scheduler.registerProcessors([new RemindProcessor()]);
}
```

### 2. Schedule a One-Time Job at Runtime

Use `modify.getScheduler().scheduleOnce()` inside any event handler or slash command:

```typescript
// Inside a slash command executor
const scheduler = modify.getScheduler();

await scheduler.scheduleOnce({
    id: 'remind-processor',          // Must match the processor id
    when: '2 hours',                 // Human-interval: run in 2 hours
    data: {
        message: 'Time for standup!',
        roomId: context.getRoom().id,
        userId: context.getSender().id,
    },
});
```

### 3. Schedule a One-Time Job with a Date

```typescript
const alarmTime = new Date('2026-12-25T08:00:00Z');

await scheduler.scheduleOnce({
    id: 'remind-processor',
    when: alarmTime,                // Exact date/time
    data: {
        message: 'Merry Christmas!',
        roomId: room.id,
        userId: user.id,
    },
});
```

### 4. Schedule a Recurring Job

```typescript
// Run every 30 minutes
await scheduler.scheduleRecurring({
    id: 'stats-collector',
    interval: '30 minutes',         // Human-interval
    skipImmediate: false,            // Run immediately, then every 30 min
    data: {
        targetRoom: 'general',
    },
});
```

### 5. Schedule a Recurring Job with a Cron Expression

```typescript
// Run at 9 AM every Monday
await scheduler.scheduleRecurring({
    id: 'weekly-report',
    interval: '0 9 * * 1',          // Cron: minute hour day-of-month month day-of-week
    skipImmediate: true,             // Wait until Monday 9 AM for the first run
    data: {
        reportType: 'weekly',
    },
});
```

### 6. Cancel Jobs

```typescript
const scheduler = modify.getScheduler();

// Cancel a specific job (use the job ID returned from scheduling)
const jobId = await scheduler.scheduleOnce({ id: 'my-processor', when: '1 hour', data: {} });
if (jobId) {
    await scheduler.cancelJob(jobId);
}

// Cancel all jobs from your App
await scheduler.cancelAllJobs();
```

---

## Example (Complete Reminder App)

```typescript
import { App } from '@rocket.chat/apps-engine/definition/App';
import {
    IConfigurationExtend,
    IRead,
    IModify,
    IHttp,
    IPersistence,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
    ISlashCommand,
    SlashCommandContext,
} from '@rocket.chat/apps-engine/definition/slashcommands';
import {
    IProcessor,
    IJobContext,
} from '@rocket.chat/apps-engine/definition/scheduler';

// ---- Processor ----
class RemindProcessor implements IProcessor {
    public id = 'remind';

    public async processor(
        jobContext: IJobContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<void> {
        const { roomId, userId, message } = jobContext;
        const appUser = await read.getUserReader().getAppUser();
        const room = await read.getRoomReader().getById(roomId);

        if (!room) return;

        const builder = modify.getCreator().startMessage()
            .setRoom(room)
            .setSender(appUser)
            .setText(`Reminder for @${userId}:\n${message}`);

        await modify.getCreator().finish(builder);
    }
}

// ---- Slash Command ----
class RemindCommand implements ISlashCommand {
    public command = 'remind';
    public i18nParamsExample = 'me in 10 minutes "Meeting time!"';
    public i18nDescription = 'Set a reminder';
    public providesPreview = false;

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<void> {
        const args = context.getArguments();
        const sender = context.getSender();
        const room = context.getRoom();

        if (args.length < 3) {
            await this.sendHelp(read, modify, room);
            return;
        }

        // Parse: /remind me in 10 minutes "Meeting time!"
        const timeArg = args[2];     // '10'
        const unit = args[3] || 'minutes'; // 'minutes'
        const remaining = args.slice(4).join(' ');
        const message = remaining.replace(/^"|"$/g, ''); // strip quotes

        if (!message) {
            await this.sendHelp(read, modify, room);
            return;
        }

        const scheduler = modify.getScheduler();

        const jobId = await scheduler.scheduleOnce({
            id: 'remind',
            when: `${timeArg} ${unit}`,
            data: {
                roomId: room.id,
                userId: sender.id,
                message: message,
            },
        });

        const appUser = await read.getUserReader().getAppUser();
        const builder = modify.getCreator().startMessage()
            .setRoom(room)
            .setSender(appUser)
            .setText(`Got it! I'll remind you in ${timeArg} ${unit}: "${message}"${jobId ? ` (job: ${jobId})` : ''}`);

        await modify.getCreator().finish(builder);
    }

    private async sendHelp(read: IRead, modify: IModify, room: any): Promise<void> {
        const appUser = await read.getUserReader().getAppUser();
        const builder = modify.getCreator().startMessage()
            .setRoom(room)
            .setSender(appUser)
            .setText('Usage: /remind me in 10 minutes "Meeting time!"');

        await modify.getCreator().finish(builder);
    }
}

// ---- App ----
export class ReminderApp extends App {
    protected async extendConfiguration(configuration: IConfigurationExtend): Promise<void> {
        await Promise.all([
            configuration.scheduler.registerProcessors([new RemindProcessor()]),
            configuration.slashCommands.provideSlashCommand(new RemindCommand()),
        ]);
    }
}
```

---

## Interval Formats

| Format | Example | Description |
|--------|---------|-------------|
| Human-interval | `'2 hours'` | Uses [agenda/human-interval](https://github.com/agenda/human-interval). Supports: seconds, minutes, hours, days, weeks, months, years |
| Human-interval | `'tomorrow at 9am'` | Relative date/time expressions |
| Cron expression | `'0 9 * * 1'` | Standard cron syntax: minute hour day-of-month month day-of-week |
| Milliseconds | `300000` | Number of milliseconds (300000 = 5 minutes) |

---

## Best Practices

- **Register processors once in `extendConfiguration()`** — then schedule them at runtime as needed.
- **Use descriptive processor `id` values** — they appear in logs and are used for cancellation.
- **Pass context via `data`** — room ID, user ID, messages. Don't rely on global state.
- **Use `skipImmediate: true` for cron-based schedules** — avoids running immediately when the desired time is far in the future.
- **Store job IDs** if you need to cancel them later — `scheduleOnce()` and `scheduleRecurring()` can return the job ID.
- **Cancel jobs on uninstall/disable** — call `cancelAllJobs()` in `onUninstall()` to clean up.

---

## Common Mistakes

- **Scheduling a job with an `id` that doesn't match any processor** — the job silently fails.
- **Using ISO date strings without timezone** — specify UTC or include the offset.
- **Assuming `scheduleOnce` always returns a job ID** — it can return `void`.
- **Not handling missing `data` fields in the processor** — always guard with defaults.
- **Scheduling inside a tight loop** — it creates many individual jobs. Batch them if possible.
- **Forgetting to cancel jobs when the App is disabled/uninstalled** — orphan jobs may still fire.

---

## Related Topics

- [Scheduler Processors](./scheduler-processors.md)
- [App Lifecycle](../app/app-lifecycle.md)
- [Slash Command Definition](../commands/slash-command-definition.md)
- [IPersistence Accessor](../accessors/i-persistence-accessor.md)
