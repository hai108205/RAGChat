import { Redis, type RedisOptions } from "ioredis";
import { EventEmitter } from "events";
import { config } from "../config/runtime.js";

const redisOptions: RedisOptions = {
    host: config.redis.host,
    port: config.redis.port,
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
