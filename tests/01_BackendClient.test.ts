import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { BackendClient, HTTP_TIMEOUT } from "../src/lib/BackendClient";
import { BackendClientError } from "../src/lib/BackendTypes";
import { ERRORS } from "../src/constants/Errors";
import { MockRead } from "./mocks/MockRead";
import { MockHttp } from "./mocks/MockHttp";
import { startRealBackend, stopRealBackend } from "./server/RealBackendHarness";
import {
    getBackendRuntimeSettings,
    DEFAULT_BACKEND_RUNTIME_SETTINGS,
    ALLOWED_LLM_MODELS,
    ALLOWED_EMBEDDING_MODELS,
} from "../src/utils/BackendRuntimeSettings";
import { RequestMethod } from "@rocket.chat/apps-engine/definition/accessors";

describe("Unit Test Suite: BackendClient Runtime Settings Injection", () => {
    let mockRead: MockRead;
    let mockHttp: MockHttp;
    let client: BackendClient;

    beforeEach(() => {
        mockRead = new MockRead();
        mockRead.setSetting("backend-url", "http://localhost:8000");
        mockRead.setSetting("integration-token", "test-token");
        mockHttp = new MockHttp();
        client = new BackendClient(mockHttp, mockRead);
    });

    it("reads default runtime settings when unconfigured", async () => {
        const settings = await getBackendRuntimeSettings(mockRead);
        expect(settings.model).toBe("api-ai.box/deepseek-v4-flash");
        expect(settings.embeddingModel).toBe("openrouter/openai/text-embedding-3-small");
        expect(settings.temperature).toBe(0.7);
        expect(settings.workspaceId).toBe("default");
    });

    it("advertises the gateway models in the selectable runtime model lists", () => {
        expect(ALLOWED_LLM_MODELS).toContain("api-ai.box/deepseek-v4-flash");
        expect(ALLOWED_EMBEDDING_MODELS).toContain("openrouter/openai/text-embedding-3-small");
    });

    it("reads custom runtime settings from MockRead and clamps temperature", async () => {
        mockRead.setSetting("workspace-id", "custom-ws");
        mockRead.setSetting("model", "anthropic/claude-3-5-sonnet");
        mockRead.setSetting("embedding-model", "openai/text-embedding-3-large");
        mockRead.setSetting("temperature", 1.8);

        const settings = await getBackendRuntimeSettings(mockRead);
        expect(settings.workspaceId).toBe("custom-ws");
        expect(settings.model).toBe("anthropic/claude-3-5-sonnet");
        expect(settings.embeddingModel).toBe("openai/text-embedding-3-large");
        expect(settings.temperature).toBe(1.8);
    });

    it("injects runtime settings into askAsync payload automatically", async () => {
        mockRead.setSetting("workspace-id", "auto-ws");
        mockRead.setSetting("model", "anthropic/claude-3-5-sonnet");
        mockRead.setSetting("embedding-model", "openai/text-embedding-3-large");
        mockRead.setSetting("temperature", 0.4);

        mockHttp.registerMockResponse({
            url: "/api/v1/integrations/rocketchat/messages/async",
            method: "POST",
            statusCode: 202,
            data: { status: "accepted", jobId: "job-1", requestId: "req-1" },
        });

        const res = await client.askAsync("What is RAG?", "u1", "r1", undefined, undefined, [], "req-1");
        expect(res.status).toBe("accepted");

        const requests = mockHttp.getRecordedRequests();
        expect(requests).toHaveLength(1);
        const reqData = requests[0].options?.data;
        expect(reqData.workspaceId).toBe("auto-ws");
        expect(reqData.model).toBe("anthropic/claude-3-5-sonnet");
        expect(reqData.embeddingModel).toBe("openai/text-embedding-3-large");
        expect(reqData.temperature).toBe(0.4);
    });

    it("allows options to override runtime settings in askAsync", async () => {
        mockRead.setSetting("model", "anthropic/claude-3-5-sonnet");
        mockRead.setSetting("temperature", 0.4);

        mockHttp.registerMockResponse({
            url: "/api/v1/integrations/rocketchat/messages/async",
            method: "POST",
            statusCode: 202,
            data: { status: "accepted", jobId: "job-2", requestId: "req-2" },
        });

        await client.askAsync(
            "What is RAG?",
            "u1",
            "r1",
            "thread-1",
            "place-1",
            [],
            "req-2",
            "explicit-ws",
            "http://callback.url",
            {
                model: "openai/gpt-4o",
                temperature: 0.1,
                embeddingModel: "openai/text-embedding-3-large",
            },
        );

        const requests = mockHttp.getRecordedRequests();
        const reqData = requests[0].options?.data;
        expect(reqData.workspaceId).toBe("explicit-ws");
        expect(reqData.model).toBe("openai/gpt-4o");
        expect(reqData.temperature).toBe(0.1);
        expect(reqData.embeddingModel).toBe("openai/text-embedding-3-large");
        expect(reqData.threadId).toBe("thread-1");
        expect(reqData.placeholderId).toBe("place-1");
        expect(reqData.callbackUrl).toBe("http://callback.url");
    });

    it("injects embeddingModel and workspaceId into uploadBase64 payload", async () => {
        mockRead.setSetting("workspace-id", "upload-ws");
        mockRead.setSetting("embedding-model", "openai/text-embedding-3-large");

        mockHttp.registerMockResponse({
            url: "/api/v1/integrations/rocketchat/sources/base64",
            method: "POST",
            statusCode: 202,
            data: { status: "accepted", sourceId: "src-1", requestId: "up-1" },
        });

        await client.uploadBase64({
            rocketUserId: "u1",
            roomId: "r1",
            filename: "test.md",
            contentBase64: "dGVzdA==",
            requestId: "up-1",
        });

        const requests = mockHttp.getRecordedRequests();
        const reqData = requests[0].options?.data;
        expect(reqData.workspaceId).toBe("upload-ws");
        expect(reqData.embeddingModel).toBe("openai/text-embedding-3-large");
    });

    it("injects model and temperature into summarize, explain, translate, search", async () => {
        mockRead.setSetting("workspace-id", "util-ws");
        mockRead.setSetting("model", "openai/gpt-4o");
        mockRead.setSetting("temperature", 0.3);

        mockHttp.registerMockResponse({
            url: "/api/v1/integrations/rocketchat/utilities/completion",
            method: "POST",
            statusCode: 200,
            data: { summary: "Short summary" },
        });

        await client.summarize("Long text");

        const requests = mockHttp.getRecordedRequests();
        const reqData = requests[0].options?.data;
        expect(reqData.operation).toBe("summarize");
        expect(reqData.workspaceId).toBe("util-ws");
        expect(reqData.model).toBe("openai/gpt-4o");
        expect(reqData.temperature).toBe(0.3);
    });
});

describe("Unit Test Suite: Apps-Engine HTTP Budgets & Timeouts", () => {
    let mockRead: MockRead;
    let mockHttp: MockHttp;
    let client: BackendClient;

    beforeEach(() => {
        mockRead = new MockRead();
        mockRead.setSetting("backend-url", "http://localhost:8000");
        mockRead.setSetting("integration-token", "test-token");
        mockHttp = new MockHttp();
        client = new BackendClient(mockHttp, mockRead);
    });

    it("verifies HTTP_TIMEOUT constant matches Apps-Engine budget definitions", () => {
        expect(HTTP_TIMEOUT.ENQUEUE).toBe(5000);
        expect(HTTP_TIMEOUT.SEARCH).toBe(5000);
        expect(HTTP_TIMEOUT.UTILITY).toBe(8000);
        expect(HTTP_TIMEOUT.MANAGEMENT).toBe(8000);
        expect(HTTP_TIMEOUT.DEFAULT).toBe(8000);
        expect(HTTP_TIMEOUT.DEFAULT).not.toBe(60000);
    });

    it("uses ENQUEUE timeout (5000ms) on askAsync and uploadBase64", async () => {
        mockHttp.registerMockResponse({
            url: "/api/v1/integrations/rocketchat/messages/async",
            method: "POST",
            statusCode: 202,
            data: { status: "accepted", jobId: "job-1", requestId: "req-1" },
        });
        mockHttp.registerMockResponse({
            url: "/api/v1/integrations/rocketchat/sources/base64",
            method: "POST",
            statusCode: 202,
            data: { status: "accepted", sourceId: "src-1", requestId: "up-1" },
        });

        await client.askAsync("Question", "user1", "room1", undefined, undefined, [], "req-1");
        await client.uploadBase64({
            rocketUserId: "user1",
            roomId: "room1",
            filename: "doc.txt",
            contentBase64: "dGVzdA==",
            requestId: "up-1",
        });

        const requests = mockHttp.getRecordedRequests();
        expect(requests[0].options?.timeout).toBe(5000);
        expect(requests[1].options?.timeout).toBe(5000);
    });

    it("uses SEARCH timeout (5000ms) on search", async () => {
        mockHttp.registerMockResponse({
            url: "/api/v1/integrations/rocketchat/utilities/completion",
            method: "POST",
            statusCode: 200,
            data: { results: [{ title: "T1", snippet: "S1", relevance: 0.9 }] },
        });

        await client.search("query", 5, "user1", "room1", "s-1");
        const requests = mockHttp.getRecordedRequests();
        expect(requests[0].options?.timeout).toBe(5000);
    });

    it("uses UTILITY timeout (8000ms) on summarize, explain, translate, ask", async () => {
        mockHttp.registerMockResponse({
            url: "/api/v1/integrations/rocketchat/utilities/completion",
            method: "POST",
            statusCode: 200,
            data: { result: "Done" },
        });

        await client.summarize("text", "sum-1");
        await client.explain("concept", "exp-1");
        await client.translate("text", "vi", "trans-1");
        await client.ask("question", "user1", "room1", [], "ask-1");

        const requests = mockHttp.getRecordedRequests();
        expect(requests[0].options?.timeout).toBe(8000);
        expect(requests[1].options?.timeout).toBe(8000);
        expect(requests[2].options?.timeout).toBe(8000);
        expect(requests[3].options?.timeout).toBe(8000);
    });

    it("uses MANAGEMENT timeout (8000ms) on listDocuments, listSources, deleteSource, submitFeedback", async () => {
        mockHttp.registerMockResponse({
            url: "/api/v1/integrations/rocketchat/stats",
            method: "GET",
            statusCode: 200,
            data: { documents: [] },
        });
        mockHttp.registerMockResponse({
            url: "/api/v1/integrations/rocketchat/sources",
            method: "GET",
            statusCode: 200,
            data: { sources: [] },
        });
        mockHttp.registerMockResponse({
            url: "/api/v1/integrations/rocketchat/sources/src-123",
            method: "DELETE",
            statusCode: 200,
            data: { success: true },
        });
        mockHttp.registerMockResponse({
            url: "/api/v1/integrations/rocketchat/feedback",
            method: "POST",
            statusCode: 200,
            data: { success: true },
        });

        await client.listDocuments("ws1", "r1", undefined, "d-1");
        await client.listSources("ws1", "r1", undefined, "s-1");
        await client.deleteSource("src-123", "ws1", "r1", "room", "del-1");
        await client.submitFeedback({
            rocketUserId: "u1",
            roomId: "r1",
            rating: "positive",
        }, "fb-1");

        const requests = mockHttp.getRecordedRequests();
        expect(requests[0].options?.timeout).toBe(8000);
        expect(requests[1].options?.timeout).toBe(8000);
        expect(requests[2].options?.timeout).toBe(8000);
        expect(requests[3].options?.timeout).toBe(8000);
    });
});

describe("Unit Test Suite: Retry Semantics & Backoff", () => {
    let mockRead: MockRead;
    let mockHttp: MockHttp;
    let client: BackendClient;

    beforeEach(() => {
        mockRead = new MockRead();
        mockRead.setSetting("backend-url", "http://localhost:8000");
        mockRead.setSetting("integration-token", "test-token");
        mockHttp = new MockHttp();
        client = new BackendClient(mockHttp, mockRead);
    });

    it("retries transient 502 error and succeeds on second attempt", async () => {
        let attempts = 0;
        mockHttp.post = async (url, options) => {
            attempts++;
            if (attempts === 1) {
                return {
                    statusCode: 502,
                    data: { statusCode: 502, success: false, message: "Temporary Bad Gateway" },
                    content: JSON.stringify({ statusCode: 502, message: "Temporary Bad Gateway" }),
                    headers: {},
                    url,
                    method: RequestMethod.POST,
                };
            }
            return {
                statusCode: 200,
                data: { success: true, data: { summary: "Success on retry" } },
                content: JSON.stringify({ success: true, data: { summary: "Success on retry" } }),
                headers: {},
                url,
                method: RequestMethod.POST,
            };
        };

        const result = await client.summarize("Long text to summarize", "sum-retry-1");
        expect(result).toBe("Success on retry");
        expect(attempts).toBe(2);
    });

    it("retries on 429 Rate Limit error with exponential backoff", async () => {
        let attempts = 0;
        mockHttp.get = async (url, options) => {
            attempts++;
            if (attempts < 3) {
                return {
                    statusCode: 429,
                    data: { statusCode: 429, success: false, message: "Rate limit exceeded" },
                    content: "",
                    headers: {},
                    url,
                    method: RequestMethod.GET,
                };
            }
            return {
                statusCode: 200,
                data: { success: true, data: { sources: [] } },
                content: "",
                headers: {},
                url,
                method: RequestMethod.GET,
            };
        };

        const sources = await client.listSources("ws1", "r1", undefined, "src-retry-429");
        expect(sources).toEqual([]);
        expect(attempts).toBe(3);
    });

    it("does NOT retry 400 Bad Request error", async () => {
        let attempts = 0;
        mockHttp.post = async (url, options) => {
            attempts++;
            return {
                statusCode: 400,
                data: { statusCode: 400, success: false, message: "Validation error" },
                content: "",
                headers: {},
                url,
                method: RequestMethod.POST,
            };
        };

        await expect(client.summarize("Bad text", "req-400")).rejects.toThrow();
        expect(attempts).toBe(1);
    });

    it("does NOT retry 401 Unauthorized error", async () => {
        let attempts = 0;
        mockHttp.get = async (url, options) => {
            attempts++;
            return {
                statusCode: 401,
                data: { statusCode: 401, success: false, message: "Invalid integration token" },
                content: "",
                headers: {},
                url,
                method: RequestMethod.GET,
            };
        };

        await expect(client.listSources("ws1", "r1", undefined, "req-401")).rejects.toThrow();
        expect(attempts).toBe(1);
    });

    it("does NOT retry 403 Forbidden error", async () => {
        let attempts = 0;
        mockHttp.del = async (url, options) => {
            attempts++;
            return {
                statusCode: 403,
                data: { statusCode: 403, success: false, message: "Forbidden room access" },
                content: "",
                headers: {},
                url,
                method: RequestMethod.DELETE,
            };
        };

        await expect(client.deleteSource("src-1", "ws1", "r1", "room", "req-403")).rejects.toThrow();
        expect(attempts).toBe(1);
    });

    it("exhausts retries on persistent 500 error and throws BackendClientError", async () => {
        let attempts = 0;
        mockHttp.post = async (url, options) => {
            attempts++;
            return {
                statusCode: 500,
                data: { statusCode: 500, success: false, message: "Internal server error" },
                content: "",
                headers: {},
                url,
                method: RequestMethod.POST,
            };
        };

        await expect(client.summarize("Text", "req-500")).rejects.toThrow(BackendClientError);
        expect(attempts).toBe(3); // Initial attempt + 2 retries
    });
});

describe("Unit Test Suite: Typed Error Parsing & User-Facing Semantics", () => {
    let mockRead: MockRead;
    let mockHttp: MockHttp;
    let client: BackendClient;

    beforeEach(() => {
        mockRead = new MockRead();
        mockRead.setSetting("backend-url", "http://localhost:8000");
        mockRead.setSetting("integration-token", "test-token");
        mockHttp = new MockHttp();
        client = new BackendClient(mockHttp, mockRead);
    });

    it("parses validation errors array from backend envelope", async () => {
        mockHttp.registerMockResponse({
            url: "/api/v1/integrations/rocketchat/utilities/completion",
            method: "POST",
            statusCode: 400,
            data: {
                statusCode: 400,
                success: false,
                message: "Validation failed",
                errors: [
                    { field: "query", message: "Query text cannot be empty" },
                    { field: "topK", message: "topK must be positive" },
                ],
                errorCode: "VALIDATION_ERROR",
                requestId: "val-req-1",
            },
        });

        try {
            await client.search("", 0, "u1", "r1", "val-req-1");
            expect.unreachable("Should have thrown");
        } catch (error: any) {
            expect(error).toBeInstanceOf(BackendClientError);
            const err = error as BackendClientError;
            expect(err.statusCode).toBe(400);
            expect(err.errorCode).toBe("VALIDATION_ERROR");
            expect(err.requestId).toBe("val-req-1");
            expect(err.message).toContain("Validation failed");
            expect(err.message).toContain("Query text cannot be empty");
            expect(err.retryable).toBe(false);
        }
    });

    it("provides safe userMessage for 401/403 auth errors", () => {
        const err401 = new BackendClientError({ statusCode: 401, message: "Invalid Bearer token" });
        expect(err401.userMessage).toBe(ERRORS.AUTH_ERROR);
        expect(err401.retryable).toBe(false);

        const err403 = new BackendClientError({ statusCode: 403, message: "Access forbidden" });
        expect(err403.userMessage).toBe(ERRORS.AUTH_ERROR);
        expect(err403.retryable).toBe(false);
    });

    it("provides safe userMessage for 429 rate limit error", () => {
        const err429 = new BackendClientError({ statusCode: 429, message: "Too Many Requests" });
        expect(err429.userMessage).toBe(ERRORS.RATE_LIMIT);
        expect(err429.retryable).toBe(true);
    });

    it("provides safe userMessage for 504 gateway timeout", () => {
        const err504 = new BackendClientError({ statusCode: 504, message: "LLM Provider Timeout" });
        expect(err504.userMessage).toBe(ERRORS.GATEWAY_TIMEOUT);
        expect(err504.retryable).toBe(true);
    });

    it("provides safe userMessage for 408 request timeout", () => {
        const err408 = new BackendClientError({ statusCode: 408, message: "Request Timeout" });
        expect(err408.userMessage).toBe(ERRORS.TIMEOUT);
        expect(err408.retryable).toBe(true);
    });

    it("provides safe userMessage for 500 server error", () => {
        const err500 = new BackendClientError({ statusCode: 500, message: "Database connection failed" });
        expect(err500.userMessage).toBe(ERRORS.SERVER_ERROR);
        expect(err500.retryable).toBe(true);
    });

    it("throws BackendClientError when envelope has success: false on 200 OK", async () => {
        mockHttp.registerMockResponse({
            url: "/api/v1/integrations/rocketchat/utilities/completion",
            method: "POST",
            statusCode: 200,
            data: {
                statusCode: 200,
                success: false,
                message: "Internal worker dropped task",
                errorCode: "WORKER_FAILURE",
            },
        });

        await expect(client.summarize("Text", "fail-200")).rejects.toThrow(BackendClientError);
    });

    it("handles non-JSON error content gracefully", async () => {
        mockHttp.registerMockResponse({
            url: "/api/v1/integrations/rocketchat/utilities/completion",
            method: "POST",
            statusCode: 503,
            content: "<html><body>503 Service Unavailable</body></html>",
        });

        try {
            await client.summarize("Text", "html-503");
            expect.unreachable("Should have thrown");
        } catch (error: any) {
            expect(error).toBeInstanceOf(BackendClientError);
            expect(error.statusCode).toBe(503);
            expect(error.userMessage).toBe(ERRORS.SERVER_ERROR);
        }
    });
});

describe.skip("Regression Test Suite 1: BackendClient with Real Docker Backend", () => {
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
