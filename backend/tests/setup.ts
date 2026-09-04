import { beforeAll, afterAll } from "vitest";

Object.assign(process.env, {
    NODE_ENV: "test",
    PORT: "8000",
    DATABASE_URL: "postgresql://testuser:testpassword@localhost:5433/docchat_test",
    REDIS_HOST: "localhost",
    REDIS_PORT: "6379",
    QDRANT_URL: "http://localhost:6333",
    ACCESS_TOKEN_SECRET: "test-access-secret",
    ACCESS_TOKEN_EXPIRY: "1h",
    REFRESH_TOKEN_SECRET: "test-refresh-secret",
    REFRESH_TOKEN_EXPIRY: "1d",
    CIPHER_KEY: Buffer.alloc(32, 1).toString("base64"),
    ENCRYPTION_ALGORITHM: "aes-256-gcm",
    ROCKETCHAT_INTEGRATION_TOKEN: "test-secret-token",
    CORS_ORIGIN: "http://localhost:3001",
});

beforeAll(async () => {
    // Global test initialization
});

afterAll(async () => {
    // Global test cleanup
});
