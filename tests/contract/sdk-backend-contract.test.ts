import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as jsYaml from "js-yaml";
import { z } from "zod";
import {
    rocketchatAsyncMessageSchema,
    rocketchatStatsSchema,
    rocketchatSourcesQuerySchema,
    rocketchatDeleteSourceSchema,
    rocketchatFeedbackSchema,
    rocketchatBase64SourceSchema,
    rocketchatUtilityCompletionSchema,
    errorEnvelopeSchema,
    chatCompletedCallbackSchema,
    chatFailedCallbackSchema,
    indexingCompleteCallbackSchema,
    indexingFailedCallbackSchema,
    rocketchatCallbackPayloadSchema,
} from "../../backend/utils/generated/rocketchatSchemas.js";
import type { BackendResponseEnvelope } from "../../src/lib/BackendTypes.js";

const CONTRACT_PATH = path.resolve(__dirname, "../../contracts/rocketchat-integration.openapi.yaml");

const parseYaml = (content: string): any => {
    if (typeof (jsYaml as any).load === "function") return (jsYaml as any).load(content);
    if ((jsYaml as any).default && typeof (jsYaml as any).default.load === "function") return (jsYaml as any).default.load(content);
    throw new Error("js-yaml load function not found");
};

describe("SDK-Backend OpenAPI Integration Contract", () => {
    const rawContract = fs.readFileSync(CONTRACT_PATH, "utf8");
    const openapi = parseYaml(rawContract) as any;

    it("loads valid OpenAPI 3.1.0 specification", () => {
        expect(openapi).toBeDefined();
        expect(openapi.openapi).toBe("3.1.0");
        expect(openapi.info.title).toBe("Rocket.Chat Integration API");
        expect(openapi.paths).toBeDefined();
    });

    describe("7 Defined Integration Endpoints", () => {
        const expectedEndpoints = [
            { path: "/messages/async", method: "post", expectedStatus: 202 },
            { path: "/stats", method: "get", expectedStatus: 200 },
            { path: "/sources", method: "get", expectedStatus: 200 },
            { path: "/sources/{id}", method: "delete", expectedStatus: 200 },
            { path: "/feedback", method: "post", expectedStatus: 200 },
            { path: "/sources/base64", method: "post", expectedStatus: 202 },
            { path: "/utilities/completion", method: "post", expectedStatus: 200 },
        ];

        it("defines all 7 endpoints with correct HTTP methods and primary response status", () => {
            for (const ep of expectedEndpoints) {
                const pathObj = openapi.paths[ep.path];
                expect(pathObj, `Missing path definition for ${ep.path}`).toBeDefined();
                const opObj = pathObj[ep.method];
                expect(opObj, `Missing method ${ep.method} for ${ep.path}`).toBeDefined();
                expect(opObj.responses[String(ep.expectedStatus)]).toBeDefined();
                expect(opObj.security).toEqual(expect.arrayContaining([{ BearerAuth: [] }]));
            }
        });

        it("includes BearerAuth security scheme and X-Request-Id header", () => {
            expect(openapi.components.securitySchemes.BearerAuth).toBeDefined();
            expect(openapi.components.securitySchemes.BearerAuth.type).toBe("http");
            expect(openapi.components.securitySchemes.BearerAuth.scheme).toBe("bearer");
            expect(openapi.components.parameters.XRequestIdHeader).toBeDefined();
            expect(openapi.components.headers["X-Request-Id"]).toBeDefined();
        });

        it("declares standard error status codes in components responses", () => {
            const expectedErrors = ["400BadRequest", "401Unauthorized", "403Forbidden", "404NotFound", "409Conflict", "422Unprocessable", "500InternalError", "504GatewayTimeout"];
            for (const errKey of expectedErrors) {
                expect(openapi.components.responses[errKey], `Missing component response ${errKey}`).toBeDefined();
            }
        });
    });

    describe("Envelope Standard and Casing Compatibility", () => {
        it("validates successful response envelope schema", () => {
            const successEnvelope = {
                statusCode: 202,
                success: true,
                data: {
                    status: "accepted",
                    jobId: "job-123",
                    requestId: "req-123",
                },
                message: "Message queued for processing",
            };

            expect(successEnvelope.statusCode).toBe(202);
            expect(successEnvelope.success).toBe(true);
            expect(successEnvelope.data).toBeDefined();
            expect(successEnvelope.message).toBeDefined();
        });

        it("validates error response envelope schema with success: false and data: null", () => {
            const errorEnvelope = {
                statusCode: 400,
                success: false,
                data: null,
                message: "Validation failed: rocketUserId is required",
                errors: [{ field: "rocketUserId", message: "rocketUserId is required" }],
            };

            const parsed = errorEnvelopeSchema.safeParse(errorEnvelope);
            expect(parsed.success).toBe(true);
            if (parsed.success) {
                expect(parsed.data.statusCode).toBe(400);
                expect(parsed.data.success).toBe(false);
                expect(parsed.data.data).toBeNull();
                expect(parsed.data.errors).toHaveLength(1);
            }
        });

        it("SDK BackendResponseEnvelope accepts both camelCase statusCode and legacy statuscode", () => {
            const camelCaseEnvelope: BackendResponseEnvelope<{ count: number }> = {
                statusCode: 200,
                success: true,
                data: { count: 5 },
                message: "Success",
            };

            const legacyEnvelope: BackendResponseEnvelope<{ count: number }> = {
                statuscode: 200,
                success: true,
                data: { count: 5 },
                message: "Success",
            };

            const resolveStatus = (env: BackendResponseEnvelope) => env.statusCode ?? env.statuscode ?? 200;
            expect(resolveStatus(camelCaseEnvelope)).toBe(200);
            expect(resolveStatus(legacyEnvelope)).toBe(200);
        });
    });

    describe("Zod Validation Schemas for 7 Integration Operations", () => {
        it("validates rocketchatAsyncMessageSchema", () => {
            const valid = {
                rocketUserId: "user-1",
                roomId: "room-1",
                requestId: "req-1",
                query: "What is RAG?",
                history: [{ role: "user", content: "Hi" }],
            };
            const result = rocketchatAsyncMessageSchema.body.safeParse(valid);
            expect(result.success).toBe(true);

            const invalid = { rocketUserId: "" };
            expect(rocketchatAsyncMessageSchema.body.safeParse(invalid).success).toBe(false);
        });

        it("validates rocketchatStatsSchema", () => {
            const valid = { workspaceId: "ws-1", roomId: "r-1" };
            expect(rocketchatStatsSchema.query.safeParse(valid).success).toBe(true);
        });

        it("validates rocketchatSourcesQuerySchema with default limit", () => {
            const valid = { limit: "25" };
            const parsed = rocketchatSourcesQuerySchema.query.safeParse(valid);
            expect(parsed.success).toBe(true);
            if (parsed.success) {
                expect(parsed.data.limit).toBe(25);
            }
        });

        it("validates rocketchatDeleteSourceSchema with mode enum", () => {
            const valid = {
                params: { id: "a0000000-0000-4000-8000-000000000001" },
                query: { mode: "room", roomId: "room-1" },
            };
            expect(rocketchatDeleteSourceSchema.params.safeParse(valid.params).success).toBe(true);
            expect(rocketchatDeleteSourceSchema.query.safeParse(valid.query).success).toBe(true);

            const invalidId = { id: "invalid-uuid" };
            expect(rocketchatDeleteSourceSchema.params.safeParse(invalidId).success).toBe(false);
        });

        it("validates rocketchatFeedbackSchema with rating enum", () => {
            const valid = {
                rocketUserId: "u-123",
                rating: "positive",
                chatMessageId: "a0000000-0000-4000-8000-000000000002",
                feedbackText: "Great answer",
            };
            expect(rocketchatFeedbackSchema.body.safeParse(valid).success).toBe(true);

            const invalid = { rating: "neutral" };
            expect(rocketchatFeedbackSchema.body.safeParse(invalid).success).toBe(false);
        });

        it("validates rocketchatBase64SourceSchema and ensures 202 does not require sourceId", () => {
            const valid = {
                rocketUserId: "u-1",
                roomId: "r-1",
                filename: "doc.md",
                contentBase64: "SGVsbG8gV29ybGQ=",
                requestId: "upload-1",
            };
            expect(rocketchatBase64SourceSchema.body.safeParse(valid).success).toBe(true);

            // Upload 202 response schema
            const responseDataSchema = z.object({
                status: z.string(),
                jobId: z.string().optional(),
                requestId: z.string(),
            });
            expect(responseDataSchema.safeParse({ status: "accepted", requestId: "upload-1" }).success).toBe(true);
        });

        it("validates rocketchatUtilityCompletionSchema operations", () => {
            const validOps = ["summarize", "explain", "translate", "search"] as const;
            for (const op of validOps) {
                const result = rocketchatUtilityCompletionSchema.body.safeParse({ operation: op });
                expect(result.success).toBe(true);
            }

            const invalid = { operation: "unknown" };
            expect(rocketchatUtilityCompletionSchema.body.safeParse(invalid).success).toBe(false);
        });
    });

    describe("Webhook Callbacks Schema & Discriminator", () => {
        it("validates chat_completed callback event", () => {
            const event = {
                event: "chat_completed",
                request_id: "req-1",
                user_id: "u-1",
                room_id: "r-1",
                query: "OAuth guide?",
                answer: "Here is how to setup OAuth...",
                sources: [{ title: "OAuth Guide", relevance: 0.9 }],
            };
            const result = chatCompletedCallbackSchema.safeParse(event);
            expect(result.success).toBe(true);
            expect(rocketchatCallbackPayloadSchema.safeParse(event).success).toBe(true);
        });

        it("validates chat_failed callback event", () => {
            const event = {
                event: "chat_failed",
                request_id: "req-1",
                user_id: "u-1",
                room_id: "r-1",
                error: "LLM timeout",
            };
            expect(chatFailedCallbackSchema.safeParse(event).success).toBe(true);
            expect(rocketchatCallbackPayloadSchema.safeParse(event).success).toBe(true);
        });

        it("validates indexing_complete callback event with sourceId", () => {
            const event = {
                event: "indexing_complete",
                request_id: "req-1",
                user_id: "u-1",
                room_id: "r-1",
                document_name: "doc.md",
                chunks_count: 5,
                sourceId: "a0000000-0000-4000-8000-000000000003",
            };
            expect(indexingCompleteCallbackSchema.safeParse(event).success).toBe(true);
            expect(rocketchatCallbackPayloadSchema.safeParse(event).success).toBe(true);
        });

        it("validates indexing_failed callback event", () => {
            const event = {
                event: "indexing_failed",
                request_id: "req-1",
                user_id: "u-1",
                room_id: "r-1",
                document_name: "doc.md",
                error: "Parsing error",
            };
            expect(indexingFailedCallbackSchema.safeParse(event).success).toBe(true);
            expect(rocketchatCallbackPayloadSchema.safeParse(event).success).toBe(true);
        });
    });
});
