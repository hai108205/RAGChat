import { describe, expect, it } from "vitest";
import { parseEnvironment } from "../../config/env.js";

const baseEnvironment = (): Record<string, string> => ({
    NODE_ENV: "production",
    PORT: "8000",
    CORS_ORIGIN: "https://app.example.test,https://admin.example.test",
    CORS_METHODS: "GET,POST",
    DATABASE_URL: "postgresql://user:password@db.example.test:5432/ragchat",
    REDIS_HOST: "redis",
    REDIS_PORT: "6379",
    QDRANT_URL: "http://qdrant:6333",
    REFRESH_TOKEN_SECRET: "refresh-secret-for-tests",
    REFRESH_TOKEN_EXPIRY: "10d",
    ACCESS_TOKEN_SECRET: "access-secret-for-tests",
    ACCESS_TOKEN_EXPIRY: "1d",
    CIPHER_KEY: Buffer.alloc(32, 7).toString("base64"),
    ENCRYPTION_ALGORITHM: "aes-256-gcm",
    OPENROUTER_LLM_API_KEY: "llm-key",
    OPENROUTER_EMBEDDING_API_KEY: "embedding-key",
    ROCKETCHAT_INTEGRATION_TOKEN: "integration-token",
    ROCKETCHAT_CALLBACK_ALLOWED_ORIGINS: "https://rocketchat.example.test",
});

describe("parseEnvironment", () => {
    it("parses values once into typed, grouped configuration", () => {
        const config = parseEnvironment(baseEnvironment());

        expect(config.server.port).toBe(8000);
        expect(config.server.corsOrigins).toEqual([
            "https://app.example.test",
            "https://admin.example.test",
        ]);
        expect(config.redis.port).toBe(6379);
        expect(config.rocketchat.trustedCallbackOrigins).toEqual([
            "https://rocketchat.example.test",
        ]);
    });

    it("allows a single OpenAI key to satisfy both LLM and embedding requirements", () => {
        const environment = baseEnvironment();
        delete environment.OPENROUTER_LLM_API_KEY;
        delete environment.OPENROUTER_EMBEDDING_API_KEY;
        environment.OPENAI_API_KEY = "openai-key";

        const config = parseEnvironment(environment);

        expect(config.llm.openAiApiKey).toBe("openai-key");
    });

    it("rejects a predictable integration token in production", () => {
        const environment = baseEnvironment();
        environment.ROCKETCHAT_INTEGRATION_TOKEN = "ragchat-integration-token-secret";

        expect(() => parseEnvironment(environment)).toThrow(/ROCKETCHAT_INTEGRATION_TOKEN/i);
    });

    it("rejects an encryption key that is not 32 bytes of base64 data", () => {
        const environment = baseEnvironment();
        environment.CIPHER_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

        expect(() => parseEnvironment(environment)).toThrow(/CIPHER_KEY/i);
    });
});
