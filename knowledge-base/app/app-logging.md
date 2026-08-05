# App Logging

## Purpose

`ILogger` is the standard logging interface for Rocket.Chat Apps. It provides leveled logging methods (`debug`, `info`, `log`, `warn`, `error`, `success`) and automatic metadata capture (app ID, method name, caller, timestamp). Log entries are persisted to the database so administrators can troubleshoot App behavior.

---

## Overview

Every App receives an `ILogger` instance injected into its constructor. The logger is scoped to that App instance -- log entries include the App's identity automatically. It also tracks the current lifecycle method (`getMethod()`) and elapsed time since construction (`getTotalTime()`), making it useful for performance monitoring.

`ILogger` is safe to use in any App context: constructor, lifecycle hooks, event handlers, slash command executors, API endpoint handlers, and scheduled job processors.

---

## When To Use

- Debugging App behavior during development -> `logger.debug()`
- Recording general operational information -> `logger.info()` or `logger.log()`
- Flagging unexpected but non-fatal conditions -> `logger.warn()`
- Recording errors and failures -> `logger.error()`
- Confirming successful operations -> `logger.success()`
- Analyzing App performance -> `logger.getTotalTime()`
- Accessing all log entries programmatically -> `logger.getEntries()`

---

## Important Interfaces

### ILogger

| Member | Type | Purpose |
|--------|------|---------|
| `method` | `string` (AppMethod) | The current lifecycle method being executed (e.g., `executePreMessageSent`) |
| `debug()` | `(...items: any[]) => void` | Log debug-level messages for development troubleshooting |
| `info()` | `(...items: any[]) => void` | Log informational messages about normal operation |
| `log()` | `(...items: any[]) => void` | Generic log (same severity tier as info) |
| `warn()` | `(...items: any[]) => void` | Log warnings for non-critical issues |
| `error()` | `(...items: any[]) => void` | Log errors and exceptions |
| `success()` | `(...items: any[]) => void` | Log success confirmations |
| `getEntries()` | `() => Array<ILogEntry>` | Get all log entries recorded so far |
| `getMethod()` | `() => string` | Get the current lifecycle method name |
| `getStartTime()` | `() => Date` | Get when this logger was constructed |
| `getEndTime()` | `() => Date` | Get the end time (typically `Date.now()`) |
| `getTotalTime()` | `() => number` | Get elapsed time in milliseconds (start - end) |

### ILogEntry

| Property | Type | Required | Purpose |
|----------|------|----------|---------|
| `caller` | `string` | No | Function name that called the logger (auto-detected) |
| `severity` | `LogMessageSeverity` | Yes | Severity level of the entry |
| `timestamp` | `Date` | Yes | When the entry was created |
| `args` | `Array<any>` | Yes | The items that were logged |
| `method` | `string` | No | The lifecycle method during which it was logged |

### LogMessageSeverity (enum)

| Value | String | Usage |
|-------|--------|-------|
| `DEBUG` | `'debug'` | Verbose development information |
| `INFORMATION` | `'info'` | General operational info |
| `LOG` | `'log'` | Generic log message |
| `WARNING` | `'warning'` | Non-fatal issues |
| `ERROR` | `'error'` | Errors and failures |
| `SUCCESS` | `'success'` | Successful operation confirmation |

---

## Methods

### debug(...items: any[]): void

Log low-level debug information. Use for detailed troubleshooting during development. These entries are typically only visible in the App's log viewer.

### info(...items: any[]): void

Log general operational information. Use for tracking normal App behavior: startup, configuration changes, successful operations.

### log(...items: any[]): void

Generic log method. Semantically equivalent to `info()`. Use when none of the other levels apply.

### warn(...items: any[]): void

Log warnings. Use when the App encounters an unexpected but recoverable condition -- e.g., a setting has a deprecated value, or an optional external service is unavailable.

### error(...items: any[]): void

Log errors. Use when an operation fails or an exception is caught. These are highlighted in the admin log viewer.

### success(...items: any[]): void

Log successful operations. Use to confirm that a critical operation completed successfully. Visually distinct in log viewers.

### getEntries(): Array\<ILogEntry\>

Retrieve all log entries recorded so far in this App instance. Useful for aggregating logs programmatically or sending them to an external service.

### getTotalTime(): number

Get the total time in milliseconds this logger has been active. Useful for measuring App performance across its lifecycle.

---

## Typical Workflow

1. App is constructed -- `logger` is passed to constructor
2. App initializes -- log settings and feature registrations
3. App is enabled -- log successful enable or validation failures
4. App handles events -- log each event, errors, and successes
5. App is disabled/uninstalled -- log cleanup operations
6. Admin reviews logs in the Rocket.Chat App management UI

---

## Example

```typescript
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import {
    ILogger,
    IConfigurationExtend,
    IEnvironmentRead,
    IRead,
    IHttp,
    IPersistence,
    IModify,
    IAppAccessors,
} from '@rocket.chat/apps-engine/definition/accessors';
import { SettingType } from '@rocket.chat/apps-engine/definition/settings';

export class MyLoggingApp extends App {
    constructor(info: IAppInfo, logger: ILogger, accessors?: IAppAccessors) {
        super(info, logger, accessors);

        // Log construction -- safe because logger is available
        logger.debug('App constructed', {
            name: info.name,
            version: info.version,
            apiVersion: info.requiredApiVersion,
        });
    }

    public async initialize(
        configurationExtend: IConfigurationExtend,
        environmentRead: IEnvironmentRead,
    ): Promise<void> {
        this.getLogger().info('App initializing...');

        await configurationExtend.settings.provideSetting({
            id: 'webhook-url',
            type: SettingType.STRING,
            required: true,
            public: false,
            i18nLabel: 'Webhook URL',
            packageValue: '',
        });

        this.getLogger().success('Settings registered successfully');
        this.getLogger().debug('Logger method:', this.getLogger().getMethod());
        this.getLogger().debug('Logger uptime (ms):', this.getLogger().getTotalTime());
    }

    public async onEnable(
        environment: IEnvironmentRead,
        configurationModify: any,
    ): Promise<boolean> {
        const logger = this.getLogger();
        logger.info('Enabling App...');

        const webhookUrl = await environment.getSettings().getValueById('webhook-url');
        if (!webhookUrl) {
            logger.warn('Webhook URL is not configured', {
                settingId: 'webhook-url',
                recommendation: 'Configure the webhook URL in App Settings',
            });
            return false; // Block enable
        }

        logger.success('App enabled with webhook', { webhookUrl });
        return true;
    }

    public async onDisable(configurationModify: any): Promise<void> {
        const logger = this.getLogger();
        logger.info('App disabling...');
        logger.info('Total uptime (ms):', logger.getTotalTime());
    }

    // Example: structured error logging in a slash command handler
    private async handleCommand(
        context: any,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persistence: IPersistence,
    ): Promise<void> {
        const logger = this.getLogger();

        try {
            logger.info('Processing command', {
                command: context.getSlashCommand(),
                user: context.getSender().username,
                room: context.getRoom().id,
            });

            const response = await http.get('https://api.example.com/data');

            if (response.statusCode !== 200) {
                logger.warn('External API returned non-200', {
                    statusCode: response.statusCode,
                    url: response.url,
                });
                return;
            }

            logger.success('Command processed successfully', {
                dataSize: response.data?.length,
            });
        } catch (error) {
            logger.error('Command processing failed', {
                command: context.getSlashCommand(),
                error: error instanceof Error ? {
                    message: error.message,
                    stack: error.stack,
                } : String(error),
            });
        }
    }
}
```

---

## Best Practices

- **Use structured logging** -- Pass objects instead of formatted strings. Objects are searchable and filterable in log viewers. Prefer `logger.info({ event: 'user-login', userId })` over `logger.info('User ' + userId + ' logged in')`.
- **Use appropriate log levels** -- `debug` for development troubleshooting, `info` for general operation, `warn` for recoverable issues, `error` for failures, `success` for confirmations.
- **Log lifecycle events** -- Log at startup (`initialize`), enable (`onEnable`), disable (`onDisable`), and uninstall (`onUninstall`). This gives administrators visibility into App behavior.
- **Include context in error logs** -- Always include the operation name, relevant IDs, and the error details when logging errors.
- **Use `this.getLogger()`** throughout the App to get the same scoped logger instance. The logger auto-tracks the current lifecycle method.
- **Log before and after external calls** -- Helps diagnose network issues and track external service dependencies.

---

## Common Mistakes

- **Logging sensitive data** -- Never log API keys, passwords, tokens, or personal user data. Log entries are stored in the database and visible to administrators. Redact or mask sensitive values.
- **Excessive logging in hot paths** -- Avoid logging inside loops or high-frequency event handlers (e.g., `executePreMessageSent` on every chat message). Use sampling or rate limiting for high-traffic handlers.
- **Using `console.log()` instead of `logger`** -- Console output is not captured by Rocket.Chat's logging system. Always use the injected `ILogger`.
- **Logging without context** -- `logger.error('Failed')` is useless. Include what failed, why, and relevant IDs: `logger.error({ event: 'fetch-failed', url, statusCode })`.
- **Using the wrong severity** -- `logger.error()` for a missing optional config is misleading. Use `logger.warn()` for non-fatal issues.
- **String concatenation for log messages** -- `logger.info('User ' + user + ' did X')` loses structure. Use objects: `logger.info({ event: 'user-action', user, action: 'X' })`.

---

## Related Topics

- [App Lifecycle](./app-lifecycle.md)
- [App Configuration](./app-configuration.md)
- [App Accessors](./app-accessors.md)
- [App Permissions](./app-permissions.md)
