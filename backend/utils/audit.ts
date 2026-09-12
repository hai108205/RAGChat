import prisma from "./prismaClient.js";

export const createAuditEvent = async (
    type: string,
    userId: string | null = null,
    chatId: string | null = null,
    metadata: any = null,
) => {
    return prisma.auditEvent.create({
        data: {
            type,
            userId,
            chatId,
            metadata,
        },
    });
};
