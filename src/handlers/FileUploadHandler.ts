import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IPreFileUpload, IFileUploadContext } from '@rocket.chat/apps-engine/definition/uploads';
import { BackendClient } from '../lib/BackendClient';

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
        _modify: IModify,
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
        } catch {
            // Never block the upload — indexing failures are reported
            // through the backend callback when available.
        }
    }

    private getExtension(filename: string): string {
        const index = filename.lastIndexOf('.');
        return index === -1 ? '' : filename.slice(index).toLowerCase();
    }
}
