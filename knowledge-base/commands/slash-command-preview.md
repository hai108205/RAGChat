# Slash Command Preview

## Purpose

Slash command preview enables real-time autocomplete as the user types a command. Instead of the user sending the command and waiting for a response, the preview system shows inline suggestions that update with each keystroke.

---

## Overview

When `providesPreview: true` is set on a slash command, Rocket.Chat calls the `previewer()` function on every keystroke after `/command`. The previewer returns up to 10 `ISlashCommandPreviewItem` objects displayed inline. When the user clicks a preview item, `executePreviewItem()` is called instead of `executor()`.

The `previewer` can return items of different types: images, videos, audio, text, or generic content. The maximum items returned must be 10 or fewer.

---

## When To Use

- Search-as-you-type commands (e.g., `/gif search-query`)
- Autocomplete suggestions (e.g., `/translate` showing language matches)
- Dynamic lookup results shown inline (e.g., `/weather` showing city matches)
- Any command where the user benefits from seeing results before hitting Enter

---

## Important Interfaces

| Interface | Role | Key Members |
|-----------|------|-------------|
| `ISlashCommandPreview` | Container for preview results | `i18nTitle`, `items` |
| `ISlashCommandPreviewItem` | Individual preview item | `id`, `type`, `value` |
| `SlashCommandPreviewItemType` | Enum of preview item types | `IMAGE`, `VIDEO`, `AUDIO`, `TEXT`, `OTHER` |

---

## ISlashCommandPreview Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `i18nTitle` | `string` | Yes | i18n key or literal title shown above the preview items |
| `items` | `Array<ISlashCommandPreviewItem>` | Yes | Max 10 preview items. Can be an empty array if there are no results |

---

## ISlashCommandPreviewItem Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | Yes | Internal identifier for this preview item. Passed back to `executePreviewItem` when clicked |
| `type` | `SlashCommandPreviewItemType` | Yes | The type of content this item represents |
| `value` | `string` | Yes | The value of this item — a URL, text content, or base64-encoded data |

---

## SlashCommandPreviewItemType Enum

| Value | Enum Key | Description |
|-------|----------|-------------|
| `'image'` | `IMAGE` | Image preview. `value` is the image URL. Supports png, gif, jpg, etc. |
| `'video'` | `VIDEO` | Video preview. `value` is the video URL |
| `'audio'` | `AUDIO` | Audio preview. `value` is the audio URL |
| `'text'` | `TEXT` | Text preview. `value` is the text content shown inline |
| `'other'` | `OTHER` | Unknown/generic type. Try to avoid — use a specific type when possible |

---

## Typical Workflow

### 1. Enable Preview Mode

Set `providesPreview: true` on your `ISlashCommand` implementation:

```typescript
public providesPreview = true;
```

### 2. Implement `previewer()`

Called on each keystroke. Parse the arguments, search/filter, and return up to 10 items:

```typescript
public async previewer(
    context: SlashCommandContext,
    read: IRead,
    modify: IModify,
    http: IHttp,
    persis: IPersistence
): Promise<ISlashCommandPreview> {
    const args = context.getArguments();
    const query = args.join(' ').trim();

    if (!query) {
        return {
            i18nTitle: 'Type to search',
            items: [],
        };
    }

    // Example: search external API
    const results = await http.get(`https://api.example.com/search?q=${query}`);

    const items: ISlashCommandPreviewItem[] = results.data
        .slice(0, 10) // Max 10 items
        .map((r) => ({
            id: r.id,
            type: SlashCommandPreviewItemType.TEXT,
            value: r.name,
        }));

    return {
        i18nTitle: `Results for "${query}"`,
        items,
    };
}
```

### 3. Implement `executePreviewItem()`

Called when the user clicks a specific preview item. This replaces the executor:

```typescript
public async executePreviewItem(
    item: ISlashCommandPreviewItem,
    context: SlashCommandContext,
    read: IRead,
    modify: IModify,
    http: IHttp,
    persis: IPersistence
): Promise<void> {
    const sender = context.getSender();
    const room = context.getRoom();
    const appUser = await read.getUserReader().getAppUser();

    // The `item.id` is whatever you set in the previewer
    // Use it to identify what the user selected
    const builder = modify.getCreator().startMessage()
        .setRoom(room)
        .setSender(appUser)
        .setText(`Selected: ${item.value} (id: ${item.id})`);

    await modify.getCreator().finish(builder);
}
```

> **Important**: When `executePreviewItem` is implemented and the user clicks a preview item, `executor()` is **not called**. The `executePreviewItem` is the sole handler for that interaction. The `executor()` runs only when the user sends the command directly (hits Enter without clicking a preview item).

---

## Example (Complete Preview Command)

```typescript
import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import {
    ISlashCommand,
    ISlashCommandPreview,
    ISlashCommandPreviewItem,
    SlashCommandContext,
    SlashCommandPreviewItemType,
} from '@rocket.chat/apps-engine/definition/slashcommands';

export class GifCommand implements ISlashCommand {
    public command = 'gif';
    public i18nParamsExample = 'cute cat';
    public i18nDescription = 'Search for a GIF and post it';
    public providesPreview = true;

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<void> {
        // Called when user hits Enter without clicking a preview item
        const args = context.getArguments();
        if (args.length === 0) {
            return;
        }
        await this.postRandomGif(args.join(' '), context, read, modify, http);
    }

    public async previewer(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<ISlashCommandPreview> {
        const query = context.getArguments().join(' ').trim();

        if (!query) {
            return { i18nTitle: 'Search for GIFs', items: [] };
        }

        // Mock: imagine an external GIF API
        const gifs = await this.searchGifs(http, query);
        const items: ISlashCommandPreviewItem[] = gifs.slice(0, 10).map((gif) => ({
            id: gif.id,
            type: SlashCommandPreviewItemType.IMAGE,
            value: gif.url,
        }));

        return {
            i18nTitle: `GIFs for "${query}"`,
            items,
        };
    }

    public async executePreviewItem(
        item: ISlashCommandPreviewItem,
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<void> {
        const room = context.getRoom();
        const appUser = await read.getUserReader().getAppUser();

        const builder = modify.getCreator().startMessage()
            .setRoom(room)
            .setSender(appUser)
            .addAttachment({
                imageUrl: item.value,
            });

        await modify.getCreator().finish(builder);
    }

    private async searchGifs(http: IHttp, query: string): Promise<Array<{ id: string; url: string }>> {
        const response = await http.get(`https://api.example.com/gifs?q=${encodeURIComponent(query)}`);
        return response.data?.results ?? [];
    }

    private async postRandomGif(
        query: string,
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp
    ): Promise<void> {
        const gifs = await this.searchGifs(http, query);
        if (gifs.length === 0) return;

        const appUser = await read.getUserReader().getAppUser();
        const room = context.getRoom();
        const randomGif = gifs[Math.floor(Math.random() * gifs.length)];

        const builder = modify.getCreator().startMessage()
            .setRoom(room)
            .setSender(appUser)
            .addAttachment({ imageUrl: randomGif.url });

        await modify.getCreator().finish(builder);
    }
}
```

---

## Preview Item Execution Flow

| User Action | What Gets Called |
|-------------|-----------------|
| Types `/command` | `previewer()` on each keystroke |
| Hits Enter without clicking a preview item | `executor()` |
| Clicks a specific preview item | `executePreviewItem(item, ...)` |
| No `executePreviewItem` defined, clicks preview item | Nothing happens (item ignored) |

---

## Best Practices

- **Limit to 10 items max** — the engine enforces this. Slicing to 10 ensures compliance.
- **Handle empty queries gracefully** — return an empty items array with a helpful title.
- **Use the `id` field to encode what you need** — pass it back via `executePreviewItem` to identify the selection.
- **Use `IMAGE` type for GIF/image previews** — clients display rich inline previews.
- **Return quickly from `previewer()`** — it is called on every keystroke. Debounce expensive lookups if possible.
- **Implement both `executor()` and `executePreviewItem()`** — `executor()` is still needed for direct Enter presses.

---

## Common Mistakes

- **Setting `providesPreview: true` without implementing `previewer()`** — causes an error when the user types.
- **Returning more than 10 items** — the engine truncates them, but return exactly 10 or fewer.
- **Not handling the empty-query case** — `previewer()` is called even before any arguments are typed.
- **Slow `previewer()` causing UI lag** — each keystroke triggers a call. Cache or debounce external requests.
- **Forgetting `await` on async operations inside `previewer()`** — the Promise must resolve before the preview shows.
- **Using `OTHER` type** — prefer `TEXT`, `IMAGE`, `VIDEO`, or `AUDIO` for proper client rendering.

---

## Related Topics

- [Slash Command Definition](./slash-command-definition.md)
- [Slash Command Context](./slash-command-context.md)
- [IHttp Accessor](../accessors/i-http-accessor.md)
- [Message Builder](../accessors/message-builder.md)
