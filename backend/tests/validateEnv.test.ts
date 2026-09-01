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
};

describe("validateEnv", () => {
    beforeEach(() => {
        process.env = { ...requiredDockerEnv };
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
            throw new Error(`process.exit(${code})`);
        });
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
        expect(process.exit).not.toHaveBeenCalled();
    });
});
