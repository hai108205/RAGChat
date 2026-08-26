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
 * Forwards uploaded documents to the RAG backend for indexing.
 *
 * The upload itself is always allowed to proceed — indexing is a
 * fire-and-forget side effect. The backend notifies the room about
 * the result via the callback endpoint (indexing_complete / indexing_failed).
 */
export class FileUploadHandler implements IPreFileUpload {
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
            // Never block the upload itself, but surface the failure — a silent
            // empty catch left users with no feedback when the backend was
            // unreachable (and no callback would ever arrive).
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
