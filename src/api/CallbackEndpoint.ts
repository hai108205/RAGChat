import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
    ApiEndpoint,
    IApiEndpoint,
    IApiEndpointInfo,
    IApiRequest,
    IApiResponse,
} from '@rocket.chat/apps-engine/definition/api';
import { Logger } from '../utils/Logger';
import { sendMessage } from '../utils/MessageHelper';

/**
 * Webhook callback endpoint for the Python backend.
 *
 * The backend calls this endpoint to notify the Rocket.Chat app about
 * async job completion events — e.g., document indexing finished,
 * large summarization done, etc.
 *
 * Registered at: /api/app/callback
 */
export class CallbackEndpoint extends ApiEndpoint implements IApiEndpoint {
    public path = 'callback';

    public async post(
        request: IApiRequest,
        endpoint: IApiEndpointInfo,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence,
    ): Promise<IApiResponse> {
        const logger = new Logger(this.app.getLogger(), 'CallbackEndpoint');
        const body = request.content as Record<string, unknown>;

        logger.info('Received callback', body);

        const event = body.event as string | undefined;
        const userId = body.user_id as string | undefined;
        const roomId = body.room_id as string | undefined;
        const message = body.message as string | undefined;

        if (!event || !userId || !roomId) {
            return {
                status: 400,
                content: { error: 'Missing required fields: event, user_id, room_id' },
            };
        }

        try {
            const user = await read.getUserReader().getById(userId);
            const room = await read.getRoomReader().getById(roomId);

            if (!user || !room) {
                return {
                    status: 404,
                    content: { error: 'User or room not found' },
                };
            }

            switch (event) {
                case 'indexing_complete': {
                    const docName = body.document_name as string || 'Unknown';
                    const chunksCount = body.chunks_count as number || 0;
                    await sendMessage(
                        read, modify, room,
                        `✅ **Document Indexed:** \`${docName}\` (${chunksCount} chunks)`,
                    );
                    break;
                }

                case 'indexing_failed': {
                    const docName = body.document_name as string || 'Unknown';
                    const error = body.error as string || 'Unknown error';
                    await sendMessage(
                        read, modify, room,
                        `❌ **Indexing Failed:** \`${docName}\` — ${error}`,
                    );
                    break;
                }

                case 'summary_complete': {
                    const summary = message || 'No summary available.';
                    await sendMessage(read, modify, room, summary);
                    break;
                }

                default: {
                    if (message) {
                        await sendMessage(read, modify, room, message);
                    } else {
                        logger.warn(`Unknown callback event: ${event}`);
                    }
                }
            }

            return {
                status: 200,
                content: { status: 'ok' },
            };
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : 'Callback processing failed';
            logger.error('Callback error', errMsg);
            return {
                status: 500,
                content: { error: errMsg },
            };
        }
    }

    public async get(
        _request: IApiRequest,
        _endpoint: IApiEndpointInfo,
        _read: IRead,
        _modify: IModify,
        _http: IHttp,
        _persis: IPersistence,
    ): Promise<IApiResponse> {
        return {
            status: 200,
            content: { status: 'RAGChat Callback Endpoint' },
        };
    }
}