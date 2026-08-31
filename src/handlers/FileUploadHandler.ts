import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IPreFileUpload, IFileUploadContext } from '@rocket.chat/apps-engine/definition/uploads';
import { BackendClient } from '../lib/BackendClient';
import { sendMessage } from '../utils/MessageHelper';

const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', '.pptx', '.csv', '.xlsx', '.html'];

/**
 * Intercepts uploaded files and forwards supported documents to the RAG backend for indexing.
 *
 * Implements `IPreFileUpload`.
 *
 * Behavior:
 * 1. Checks file extension against `SUPPORTED_EXTENSIONS`.
 * 2. Encodes document `Buffer` to base64.
 * 3. Dispatches indexing request asynchronously to `/api/documents/base64`.
 * 4. Non-blocking: returns normally to allow the Rocket.Chat file upload to complete seamlessly.
 *    The backend notifies the room when indexing succeeds or fails via the `CallbackEndpoint`.
 */
export class FileUploadHandler implements IPreFileUpload {
    /**
     * Called before a file is committed to storage.
     */
    public async executePreFileUpload(
        context: IFileUploadContext,
        read: IRead,
        http: IHttp,
        _persis: IPersistence,
        modify: IModify,
    ): Promise<void> {
        const { file, content } = context;

        const ext = this.getExtension(file.name);
        if (!SUPPORTED_EXTENSIONS.includes(ext)) {
            return;
        }

        try {
            const client = new BackendClient(http, read);
            await client.post('/api/documents/base64', {
                filename: file.name,
                content_base64: content.toString('base64'),
                content_type: file.type || 'application/octet-stream',
                user_id: file.userId || '',
                room_id: file.rid || '',
            });
        } catch (error: unknown) {
            // Surface failure if backend is unreachable so user is aware indexing did not queue
            const message = error instanceof Error ? error.message : 'Indexing request failed';
            const room = await read.getRoomReader().getById(file.rid);
            if (!room) {
                return;
            }
            await sendMessage(
                read,
                modify,
                room,
                `⚠️ Could not queue **\`${file.name}\`** for indexing: ${message}`,
            );
        }
    }

    private getExtension(filename: string): string {
        const index = filename.lastIndexOf('.');
        return index === -1 ? '' : filename.slice(index).toLowerCase();
    }
}

