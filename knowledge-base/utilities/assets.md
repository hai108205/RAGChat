# App Assets

## Purpose

`IAsset` and `IAssetProvider` define how Rocket.Chat apps declare and expose static assets (images, CSS, JavaScript, or any file) that are bundled with the app and served to clients.

---

## Overview

An app implements `IAssetProvider` and returns a list of `IAsset` objects from `getAssets()`. Each asset has a name, a path to the file inside the app bundle, a MIME type, and a `public` flag. Rocket.Chat serves these assets at predictable URLs, making them available to the app's iframe-based UI components and external component pages.

---

## When To Use

- Serving custom icons/images for app UI elements (slash command icons, settings icons)
- Providing CSS or JavaScript files for external components (contextual bar, modal)
- Exposing any static file bundled with the app

---

## Interfaces

### IAsset

```typescript
export interface IAsset {
    name: string;   // Logical name / identifier for the asset
    path: string;   // File path relative to the app bundle root
    type: string;   // MIME type (e.g., 'image/png', 'text/css', 'application/javascript')
    public: boolean; // Whether the asset can be accessed without authentication
}
```

| Field | Description |
|-------|-------------|
| `name` | Human-readable identifier. Used to reference the asset in code or URLs. |
| `path` | Relative path to the file within the app's bundle directory. |
| `type` | MIME type string. Must match the actual file content for correct browser handling. |
| `public` | If `true`, the asset is served without authentication checks. If `false`, requires a valid session. |

### IAssetProvider

```typescript
export interface IAssetProvider {
    getAssets(): Array<IAsset>;
}
```

Single method -- returns the list of all assets the app provides. Called during app initialization.

---

## Registration

Implement `IAssetProvider` on the `App` class. No separate registration step is needed -- the platform discovers assets from the `getAssets()` return value.

```typescript
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { IAssetProvider } from '@rocket.chat/apps-engine/definition/assets';
import { IAsset } from '@rocket.chat/apps-engine/definition/assets/IAsset';

export class MyApp extends App implements IAssetProvider {
    constructor(info: IAppInfo) {
        super(info);
    }

    public getAssets(): Array<IAsset> {
        return [
            {
                name: 'app-icon',
                path: 'assets/icon.png',
                type: 'image/png',
                public: true,
            },
            {
                name: 'sidebar-styles',
                path: 'assets/sidebar.css',
                type: 'text/css',
                public: true,
            },
            {
                name: 'component-script',
                path: 'assets/component.js',
                type: 'application/javascript',
                public: true,
            },
        ];
    }
}
```

---

## Limitations

- The interface is minimal -- only two types (`IAsset`, `IAssetProvider`) with one method. There is no built-in asset URL generation, cache control, or content hashing in the definition layer. The platform handles serving and URL mapping internally.
- Assets are static and bundled at app build time. There is no runtime asset upload or modification API.
- The platform determines the actual URL prefix for assets; apps should reference them by relative path from the app's deployed URL.
