import { IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { Validator } from './Validator';

/**
 * Public callback URL builder for backend async jobs.
 *
 * Backend workers POST events (chat_completed, chat_failed, indexing_complete, ...)
 * back into the Rocket.Chat app via the public endpoint:
 *   `<callbackBaseUrl>/api/apps/public/<appId>/callback`
 *
 * The base URL must be the public-facing address of this Rocket.Chat workspace
 * (reachable from the backend). Configure via the `callback-base-url` app setting.
 */

export const CALLBACK_BASE_URL_SETTING = 'callback-base-url';
export const CALLBACK_PATH = 'callback';
// Matches the `id` field in app.json. Keep in sync when app id changes.
export const APP_ID = '8a800b09-3cc1-4bc1-8dbf-12592fc223eb';

/**
 * Resolves the configured callback base URL from app settings.
 * Returns an empty string when unset/invalid so callers can decide how to degrade.
 */
export async function readCallbackBaseUrl(read: IRead): Promise<string> {
    try {
        const raw = await read.getEnvironmentReader().getSettings().getValueById(CALLBACK_BASE_URL_SETTING);
        if (typeof raw === 'string' && raw.trim() && Validator.isValidUrl(raw.trim())) {
            return raw.trim().replace(/\/+$/, '');
        }
    } catch {
        // Setting not registered yet
    }
    return '';
}

/**
 * Builds the full public callback URL for this app, or undefined when
 * `callback-base-url` is not configured (backend must then rely on its own fallback).
 */
export async function buildCallbackUrl(read: IRead): Promise<string | undefined> {
    const base = await readCallbackBaseUrl(read);
    if (!base) {
        return undefined;
    }
    return `${base}/api/apps/public/${APP_ID}/${CALLBACK_PATH}`;
}
