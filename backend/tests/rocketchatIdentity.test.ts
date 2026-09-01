import { describe, it, expect, vi, beforeEach } from "vitest";

const userFindFirstMock = vi.fn();
const userCreateMock = vi.fn();
const chatFindFirstMock = vi.fn();
const chatCreateMock = vi.fn();

vi.mock("../utils/prismaClient.js", () => ({
    default: {
        user: {
            findFirst: (...args: any[]) => userFindFirstMock(...args),
            create: (...args: any[]) => userCreateMock(...args),
        },
        chat: {
            findFirst: (...args: any[]) => chatFindFirstMock(...args),
            create: (...args: any[]) => chatCreateMock(...args),
        },
    },
}));

const {
    normalizeRocketChatUsername,
    getOrCreateRocketChatUser,
    getOrCreateRocketChatChat,
    formatRocketChatCitations,
} = await import("../utils/rocketchatIdentity.js");

describe("rocketchatIdentity", () => {
    beforeEach(() => {
        userFindFirstMock.mockReset();
        userCreateMock.mockReset();
        chatFindFirstMock.mockReset();
        chatCreateMock.mockReset();
    });

    describe("normalizeRocketChatUsername", () => {
        it("normalizes workspace and user id", () => {
            expect(normalizeRocketChatUsername("ws-1", "user-123")).toBe("rc_ws-1_user-123");
            expect(normalizeRocketChatUsername(null, "user@456")).toBe("rc_default_user_456");
        });
    });

    describe("getOrCreateRocketChatUser", () => {
        it("returns existing user if found", async () => {
            userFindFirstMock.mockResolvedValue({
                id: "user-1",
                username: "rc_default_u123",
            });

            const user = await getOrCreateRocketChatUser({
                workspaceId: "default",
                rocketUserId: "u123",
            });

            expect(user.id).toBe("user-1");
            expect(userCreateMock).not.toHaveBeenCalled();
        });

        it("creates user if not found", async () => {
            userFindFirstMock.mockResolvedValue(null);
            userCreateMock.mockResolvedValue({
                id: "user-new",
                username: "rc_default_u123",
            });

            const user = await getOrCreateRocketChatUser({
                workspaceId: "default",
                rocketUserId: "u123",
            });

            expect(user.id).toBe("user-new");
            expect(userCreateMock).toHaveBeenCalledTimes(1);
        });
    });

    describe("getOrCreateRocketChatChat", () => {
        it("returns existing chat if found", async () => {
            chatFindFirstMock.mockResolvedValue({
                id: "chat-1",
                name: "RC_default_Room_GENERAL",
            });

            const chat = await getOrCreateRocketChatChat({
                userId: "user-1",
                roomId: "GENERAL",
            });

            expect(chat.id).toBe("chat-1");
            expect(chatCreateMock).not.toHaveBeenCalled();
        });

        it("creates chat if not found", async () => {
            chatFindFirstMock.mockResolvedValue(null);
            chatCreateMock.mockResolvedValue({
                id: "chat-new",
                name: "RC_default_Room_GENERAL_Thread_t1",
            });

            const chat = await getOrCreateRocketChatChat({
                userId: "user-1",
                roomId: "GENERAL",
                threadId: "t1",
            });

            expect(chat.id).toBe("chat-new");
            expect(chatCreateMock).toHaveBeenCalledTimes(1);
        });
    });

    describe("formatRocketChatCitations", () => {
        it("normalizes citations correctly", () => {
            const rawSources = [
                {
                    score: 0.85,
                    payload: {
                        title: "Doc 1",
                        body: "Content 1",
                        url: "https://example.com/1",
                    },
                },
                {
                    score: 92, // 0-100 scale
                    payload: {
                        heading: "Doc 2",
                        chunkText: "Content 2",
                        pageUrl: "https://example.com/2",
                    },
                },
            ];

            const formatted = formatRocketChatCitations(rawSources);
            expect(formatted).toHaveLength(2);
            expect(formatted[0]).toEqual({
                title: "Doc 1",
                snippet: "Content 1",
                pageUrl: "https://example.com/1",
                relevance: 0.85,
            });
            expect(formatted[1]).toEqual({
                title: "Doc 2",
                snippet: "Content 2",
                pageUrl: "https://example.com/2",
                relevance: 0.92,
            });
        });

        it("handles empty or non-array inputs safely", () => {
            expect(formatRocketChatCitations(null)).toEqual([]);
            expect(formatRocketChatCitations([])).toEqual([]);
        });
    });
});
