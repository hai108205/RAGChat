import { Redis, type RedisOptions } from "ioredis";
import { EventEmitter } from "events";

const redisPort = Number.parseInt(process.env.REDIS_PORT || "6379", 10);
const redisOptions: RedisOptions = {
    host: process.env.REDIS_HOST || "localhost",
    port: Number.isNaN(redisPort) ? 6379 : redisPort,
    maxRetriesPerRequest: null,
};

const redis = new Redis(redisOptions);
const redisSubscriber = new Redis(redisOptions);

export const progressEmitter = new EventEmitter();

redis.on("connect", () => {
    console.log("Redis connected");
});

redis.on("error", (err: Error) => {
    console.error("Redis error:", err);
});

redisSubscriber.on("connect", () => {
    console.log("Redis Subscriber connected");
});

redisSubscriber.on("error", (err: Error) => {
    console.error("Redis Subscriber error:", err);
});

redisSubscriber.on("message", (channel: string, message: string) => {
    progressEmitter.emit(channel, message);
});

export const getChatProgressKey = (chatId: string): string => `chat-progress:${chatId}`;
export const getChatProgressChannel = (chatId: string): string => `chat-progress-channel:${chatId}`;

export const updateChatProgress = async (chatId: string, payload: any): Promise<void> => {
    const data = JSON.stringify(payload);
    await redis.setex(getChatProgressKey(chatId), 3600, data);
    await redis.publish(getChatProgressChannel(chatId), data);
};

export { redisSubscriber };
export default redis;
