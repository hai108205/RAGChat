import prisma from "../utils/prismaClient.js";
import { ApiError } from "../utils/ApiError.js";
import { createAuditEvent } from "../utils/audit.js";
import { getOrCreateRocketChatUser } from "../utils/rocketchatIdentity.js";
import {
    verifyFeedbackScope,
    normalizeWorkspaceId,
    normalizeRoomId,
} from "../utils/rocketchatScope.js";

export interface RocketChatFeedbackInput {
    messageId?: string;
    chatMessageId?: string;
    rating: "positive" | "negative";
    feedbackText?: string;
    rocketUserId: string;
    actorRocketUserId?: string;
    workspaceId?: string;
    roomId?: string;
    requestId?: string;
}

export interface RocketChatFeedbackResult {
    recorded: boolean;
    rating: "positive" | "negative";
    chatMessageId?: string;
}

/**
 * Validates and records feedback on Rocket.Chat messages.
 * Enforces scope integrity (message must belong to the caller's room/workspace).
 * Allows any actor in the same room/workspace interacting with the message.
 */
export async function submitRocketChatFeedback(
    input: RocketChatFeedbackInput,
): Promise<RocketChatFeedbackResult> {
    const {
        messageId,
        chatMessageId,
        rating,
        feedbackText,
        rocketUserId,
        actorRocketUserId,
        workspaceId = "default",
        roomId,
        requestId,
    } = input;

    const finalActorId = actorRocketUserId || rocketUserId;
    const ws = normalizeWorkspaceId(workspaceId);
    const rm = normalizeRoomId(roomId);

    let chatIdOrNull: string | null = null;

    if (chatMessageId) {
        const msg = await prisma.chatMessage.findUnique({
            where: { id: chatMessageId },
            include: { chat: true },
        });

        if (!msg) {
            throw new ApiError(404, "ChatMessage not found");
        }

        chatIdOrNull = msg.chatId;

        // Verify scope integrity
        if (rm || ws) {
            verifyFeedbackScope(msg.chat, {
                workspaceId: ws,
                roomId: rm,
            });
        }
    }

    const user = await getOrCreateRocketChatUser({
        workspaceId: ws,
        rocketUserId: finalActorId,
    });

    await createAuditEvent("rocketchat.feedback", user.id, chatIdOrNull, {
        messageId,
        chatMessageId,
        rating,
        feedbackText,
        rocketUserId,
        actorRocketUserId: finalActorId,
        workspaceId: ws,
        roomId: rm,
        requestId,
    });

    return {
        recorded: true,
        rating,
        chatMessageId,
    };
}
