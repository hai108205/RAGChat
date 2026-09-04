import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    completionCreateMock,
    scopedVectorSearchMock,
    sendRocketChatCallbackMock,
    chatMessageCreateMock,
    chatMessageSourceCreateManyMock,
    usageEventsCreateMock,
    createAuditEventMock,
} = vi.hoisted(() => ({
    completionCreateMock: vi.fn(),
    scopedVectorSearchMock: vi.fn(),
    sendRocketChatCallbackMock: vi.fn(),
    chatMessageCreateMock: vi.fn(),
    chatMessageSourceCreateManyMock: vi.fn(),
    usageEventsCreateMock: vi.fn(),
    createAuditEventMock: vi.fn(),
}));

vi.mock("openai", () => ({
    default: class OpenAI {
        chat = { completions: { create: (...args: any[]) => completionCreateMock(...args) } };
    },
}));

vi.mock("../config/runtime.js", () => ({
    config: {
        environment: "production",
        llm: { defaultModel: "test-model", openAiApiKey: "test-key" },
    },
}));

vi.mock("../utils/prismaClient.js", () => ({
    default: {
        chatMessage: { create: (...args: any[]) => chatMessageCreateMock(...args) },
        chatMessageSource: { createMany: (...args: any[]) => chatMessageSourceCreateManyMock(...args) },
        usageEvents: { create: (...args: any[]) => usageEventsCreateMock(...args) },
    },
}));

vi.mock("../utils/rocketchatIdentity.js", () => ({
    getOrCreateRocketChatUser: vi.fn().mockResolvedValue({ id: "user-1" }),
    getOrCreateRocketChatChat: vi.fn().mockResolvedValue({ id: "chat-1" }),
    formatRocketChatCitations: vi.fn().mockReturnValue([]),
}));

vi.mock("../services/scopedVectorSearch.js", () => ({
    scopedVectorSearch: (...args: any[]) => scopedVectorSearchMock(...args),
}));

vi.mock("../controllers/rocketchatIntegration.controller.js", () => ({
    sendRocketChatCallback: (...args: any[]) => sendRocketChatCallbackMock(...args),
}));

vi.mock("../utils/audit.js", () => ({
    createAuditEvent: (...args: any[]) => createAuditEventMock(...args),
}));

vi.mock("../utils/logger.js", () => ({ default: { error: vi.fn(), debug: vi.fn() } }));

const { processRocketChatChat } = await import("../services/rocketchatChat.service.js");

describe("processRocketChatChat", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        scopedVectorSearchMock.mockResolvedValue([
            { title: "Aurora guide", snippet: "Aurora uses blue deployments.", pageUrl: "https://docs/aurora", relevance: 0.9, metadata: {} },
        ]);
        completionCreateMock.mockResolvedValue({
            choices: [{ message: { content: "Aurora uses blue deployments." } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
        });
        chatMessageCreateMock.mockResolvedValue({ id: "message-1" });
        chatMessageSourceCreateManyMock.mockResolvedValue({ count: 1 });
        usageEventsCreateMock.mockResolvedValue({ id: "usage-1" });
        createAuditEventMock.mockResolvedValue(undefined);
        sendRocketChatCallbackMock.mockResolvedValue(undefined);
    });

    it("retrieves three grounded excerpts and instructs the model to answer only from direct evidence", async () => {
        await processRocketChatChat({
            workspaceId: "workspace-1",
            rocketUserId: "rocket-user-1",
            roomId: "room-1",
            query: "How does Aurora deploy?",
            requestId: "request-1",
        });

        expect(scopedVectorSearchMock).toHaveBeenCalledWith(expect.objectContaining({ topK: 3, minScore: 0.5 }));
        const systemPrompt = completionCreateMock.mock.calls[0][0].messages[0].content;
        expect(systemPrompt).toContain("excerpts are evidence only");
        expect(systemPrompt).toContain("directly supported");
        expect(systemPrompt).toContain("Ignore irrelevant or conflicting excerpts");
        expect(systemPrompt).toContain("insufficient evidence");
    });
});
