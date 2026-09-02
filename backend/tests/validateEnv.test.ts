import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import validateEnv from "../utils/validateEnv.js";

const ORIGINAL_ENV = process.env;

const requiredDockerEnv = {
    PORT: "8000",
    CORS_ORIGIN: "http://localhost:3001",
    CORS_METHODS: "GET,POST,PUT,DELETE",
    DATABASE_URL: "postgresql://ragchat:ragchat@postgres:5432/ragchat",
    REFRESH_TOKEN_SECRET: "refresh-secret",
    REFRESH_TOKEN_EXPIRY: "10d",
    ACCESS_TOKEN_SECRET: "access-secret",
    ACCESS_TOKEN_EXPIRY: "1d",
    NODE_ENV: "production",
    CIPHER_KEY: "0123456789abcdef0123456789abcdef",
    ENCRYPTION_ALGORITHM: "aes-256-gcm",
    OPENROUTER_LLM_API_KEY: "openrouter-llm-key",
    OPENROUTER_EMBEDDING_API_KEY: "openrouter-embedding-key",
    QDRANT_URL: "http://qdrant:6333",
    ROCKETCHAT_INTEGRATION_TOKEN: "integration-token",
    ROCKETCHAT_CALLBACK_BASE_URL: "http://rocketchat:3000",
    ROCKETCHAT_CALLBACK_ALLOWED_ORIGINS: "http://localhost:3001,http://rocketchat:3000",
};

describe("validateEnv", () => {
    beforeEach(() => {
        process.env = { ...requiredDockerEnv };
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        process.env = ORIGINAL_ENV;
    });

    it("allows optional integration keys to be unset for the Docker stack", () => {
        process.env.RESEND_API_KEY = "";
        process.env.QDRANT_API_KEY = "";
        process.env.MEM0_API_KEY = "";
        delete process.env.MEM0_TELEMETRY;

        expect(() => validateEnv()).not.toThrow();
    });

    it("throws if ROCKETCHAT_INTEGRATION_TOKEN is missing in production", () => {
        process.env.NODE_ENV = "production";
        delete process.env.ROCKETCHAT_INTEGRATION_TOKEN;

        expect(() => validateEnv()).toThrow(/ROCKETCHAT_INTEGRATION_TOKEN/i);
    });

    it("throws if trusted callback config is missing in production", () => {
        process.env.NODE_ENV = "production";
        delete process.env.ROCKETCHAT_CALLBACK_BASE_URL;
        delete process.env.ROCKETCHAT_CALLBACK_ALLOWED_ORIGINS;

        expect(() => validateEnv()).toThrow(/ROCKETCHAT_CALLBACK_ALLOWED_ORIGINS or ROCKETCHAT_CALLBACK_BASE_URL/i);
    });

    it("allows missing token in dev mode only when ALLOW_UNAUTHENTICATED_ROCKETCHAT_DEV is true", () => {
        process.env.NODE_ENV = "development";
        delete process.env.ROCKETCHAT_INTEGRATION_TOKEN;
        delete process.env.ROCKETCHAT_CALLBACK_BASE_URL;
        delete process.env.ROCKETCHAT_CALLBACK_ALLOWED_ORIGINS;
        process.env.ALLOW_UNAUTHENTICATED_ROCKETCHAT_DEV = "true";

        expect(() => validateEnv()).not.toThrow();
    });

    it("throws in dev mode when token is missing and ALLOW_UNAUTHENTICATED_ROCKETCHAT_DEV is not set", () => {
        process.env.NODE_ENV = "development";
        delete process.env.ROCKETCHAT_INTEGRATION_TOKEN;
        delete process.env.ALLOW_UNAUTHENTICATED_ROCKETCHAT_DEV;

        expect(() => validateEnv()).toThrow(/ROCKETCHAT_INTEGRATION_TOKEN/i);
    });

    it("throws if a base required environment variable like DATABASE_URL is missing", () => {
        delete process.env.DATABASE_URL;

        expect(() => validateEnv()).toThrow(/DATABASE_URL/i);
    });
});

