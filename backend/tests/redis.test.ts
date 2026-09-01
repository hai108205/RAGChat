import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redisConstructorArgs = vi.hoisted(() => [] as unknown[]);

vi.mock("ioredis", () => {
    class MockRedis {
        constructor(options?: unknown) {
            redisConstructorArgs.push(options);
        }

        on() {
            return this;
        }
    }

    return {
        default: MockRedis,
        Redis: MockRedis,
    };
});

describe("Redis client configuration", () => {
    const originalRedisHost = process.env.REDIS_HOST;
    const originalRedisPort = process.env.REDIS_PORT;

    beforeEach(() => {
        vi.resetModules();
        redisConstructorArgs.length = 0;
    });

    afterEach(() => {
        if (originalRedisHost === undefined) {
            delete process.env.REDIS_HOST;
        } else {
            process.env.REDIS_HOST = originalRedisHost;
        }

        if (originalRedisPort === undefined) {
            delete process.env.REDIS_PORT;
        } else {
            process.env.REDIS_PORT = originalRedisPort;
        }
    });

    it("uses REDIS_HOST and REDIS_PORT for both Redis connections", async () => {
        process.env.REDIS_HOST = "redis";
        process.env.REDIS_PORT = "6380";

        await import("../utils/redis.js");

        expect(redisConstructorArgs).toEqual([
            expect.objectContaining({
                host: "redis",
                port: 6380,
                maxRetriesPerRequest: null,
            }),
            expect.objectContaining({
                host: "redis",
                port: 6380,
                maxRetriesPerRequest: null,
            }),
        ]);
    });
});
