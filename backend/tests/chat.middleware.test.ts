import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyChatOwnership } from "../middlewares/chat.middleware.js";
import { ApiError } from "../utils/ApiError.js";
import type { Request, Response, NextFunction } from "express";

const findUniqueMock = vi.fn();

vi.mock("../utils/prismaClient.js", () => ({
    default: {
        chat: {
            findUnique: (...args: any[]) => findUniqueMock(...args),
        },
    },
}));

describe("verifyChatOwnership Middleware", () => {
    let req: Partial<Request>;
    let res: Partial<Response>;
    let next: NextFunction;

    beforeEach(() => {
        findUniqueMock.mockReset();
        req = {
            params: {},
            body: {},
            user: { id: "user-123" } as any,
        };
        res = {};
        next = vi.fn();
    });

    it("should call next() if user owns the chat via req.params.chatId", async () => {
        req.params = { chatId: "chat-abc" };
        findUniqueMock.mockResolvedValue({ userId: "user-123" });

        await verifyChatOwnership(req as Request, res as Response, next);

        expect(findUniqueMock).toHaveBeenCalledWith({
            where: { id: "chat-abc" },
            select: { userId: true },
        });
        expect(next).toHaveBeenCalledWith();
    });

    it("should call next() if user owns the chat via req.body.chatId", async () => {
        req.body = { chatId: "chat-xyz" };
        findUniqueMock.mockResolvedValue({ userId: "user-123" });

        await verifyChatOwnership(req as Request, res as Response, next);

        expect(findUniqueMock).toHaveBeenCalledWith({
            where: { id: "chat-xyz" },
            select: { userId: true },
        });
        expect(next).toHaveBeenCalledWith();
    });

    it("should pass 400 ApiError to next() if chatId is missing", async () => {
        await verifyChatOwnership(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (next as any).mock.calls[0][0];
        expect(error.statusCode).toBe(400);
        expect(error.message).toContain("Chat ID is missing");
    });

    it("should pass 404 ApiError to next() if chat does not exist", async () => {
        req.params = { chatId: "non-existent-chat" };
        findUniqueMock.mockResolvedValue(null);

        await verifyChatOwnership(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (next as any).mock.calls[0][0];
        expect(error.statusCode).toBe(404);
        expect(error.message).toContain("Chat not found");
    });

    it("should pass 403 ApiError to next() if user does not own the chat", async () => {
        req.params = { chatId: "other-user-chat" };
        findUniqueMock.mockResolvedValue({ userId: "user-456" });

        await verifyChatOwnership(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (next as any).mock.calls[0][0];
        expect(error.statusCode).toBe(403);
        expect(error.message).toContain("permission");
    });
});
