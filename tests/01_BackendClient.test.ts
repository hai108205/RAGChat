import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { BackendClient } from "../src/lib/BackendClient";
import { MockRead } from "./mocks/MockRead";
import { MockHttp } from "./mocks/MockHttp";
import { startRealBackend, stopRealBackend } from "./server/RealBackendHarness";

describe("Regression Test Suite 1: BackendClient with Real Docker Backend", () => {
    let mockRead: MockRead;
    let mockHttp: MockHttp;
    let client: BackendClient;
    let backendInfo: { port: number; baseUrl: string; token: string };

    beforeAll(async () => {
        backendInfo = await startRealBackend();
        mockRead = new MockRead();
        mockRead.setSetting("backend-url", backendInfo.baseUrl);
        mockRead.setSetting("integration-token", backendInfo.token);
        mockHttp = new MockHttp();
        client = new BackendClient(mockHttp, mockRead);
    });

    afterAll(async () => {
        await stopRealBackend();
    });

    it("resolves backend URL and integration token correctly", async () => {
        const url = await client.getBackendUrl();
        const token = await client.getIntegrationToken();
        expect(url).toBe(backendInfo.baseUrl);
        expect(token).toBe(backendInfo.token);
    });

    it("checks backend health via GET /healthz", async () => {
        const res = await mockHttp.get(`${backendInfo.baseUrl}/healthz`);
        expect(res.statusCode).toBe(200);
        expect(res.data).toBeDefined();
        expect(res.data.status).toBe("OK");
        expect(res.data.services.database).toBe("UP");
        expect(res.data.services.redis).toBe("UP");
    });

    it("uploads and indexes a real Base64 markdown document into Qdrant & Postgres", async () => {
        const markdownContent = `# Rocket.Chat Integration Guide\n\nRocket.Chat is a secure open source collaboration platform with apps-engine.`;
        const contentBase64 = Buffer.from(markdownContent, "utf8").toString("base64");
        const uploadReqId = `upload-test-${Date.now()}`;

        const uploadRes = await client.uploadBase64({
            workspaceId: "test-ws",
            rocketUserId: "test-user-id",
            roomId: "test-room-id",
            filename: "integration-guide.md",
            contentBase64,
            mimeType: "text/markdown",
            requestId: uploadReqId,
        });

        expect(uploadRes.status).toBe("accepted");
        expect(uploadRes.requestId).toBe(uploadReqId);
    });

    it("lists knowledge base sources scoped to workspace and room", async () => {
        // Wait briefly for background ingestion into Postgres & Qdrant
        await new Promise((r) => setTimeout(r, 600));

        const sources = await client.listSources("test-ws", "test-room-id");
        expect(Array.isArray(sources)).toBe(true);
        expect(sources.length).toBeGreaterThanOrEqual(1);

        const found = sources.find((s) => s.filename === "integration-guide.md");
        expect(found).toBeDefined();
        expect(found?.documentationUrl).toContain("rocketchat://test-ws/test-room-id/integration-guide.md");
    });

    it("retrieves integration statistics and document counts", async () => {
        const stats = await client.listDocuments("test-ws", "test-room-id");
        expect(Array.isArray(stats)).toBe(true);
        expect(stats.length).toBeGreaterThanOrEqual(1);
    });

    it("searches knowledge base documents via database vectorless search", async () => {
        const results = await client.search("Rocket.Chat", 5, "test-user-id", "test-room-id");
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[0].title).toContain("Rocket.Chat Integration Guide");
    });

    it("submits asynchronous question via askAsync", async () => {
        const askReqId = `ask-test-${Date.now()}`;
        const askRes = await client.askAsync(
            "How does Rocket.Chat integrate with RAG?",
            "test-user-id",
            "test-room-id",
            undefined,
            "placeholder-msg-123",
            [],
            askReqId,
            "test-ws",
        );

        expect(askRes.status).toBe("accepted");
        expect(askRes.request_id).toBe(askReqId);
    });

    it("submits user feedback (thumbs up) for answer into Postgres audit log", async () => {
        const feedbackRes = await client.submitFeedback({
            workspaceId: "test-ws",
            rocketUserId: "test-user-id",
            roomId: "test-room-id",
            messageId: "placeholder-msg-123",
            rating: "positive",
            feedbackText: "Accurate and clear answer!",
        });

        expect(feedbackRes).toBe(true);
    });

    it("deletes a source and cleans up Qdrant collection", async () => {
        const sources = await client.listSources("test-ws", "test-room-id");
        const target = sources.find((s) => s.filename === "integration-guide.md");
        expect(target).toBeDefined();

        if (target) {
            const deleteRes = await client.deleteSource(target.id, "test-ws", "test-room-id");
            expect(deleteRes).toBe(true);

            const remaining = await client.listSources("test-ws", "test-room-id");
            const stillExists = remaining.some((s) => s.id === target.id);
            expect(stillExists).toBe(false);
        }
    });

    it("handles 401 unauthorized when integration token is invalid", async () => {
        mockRead.setSetting("integration-token", "invalid-bad-token");
        const badClient = new BackendClient(mockHttp, mockRead);

        await expect(badClient.listSources("test-ws", "test-room-id")).rejects.toThrow();

        // Restore valid token
        mockRead.setSetting("integration-token", backendInfo.token);
    });
});
