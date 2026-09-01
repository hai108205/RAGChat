import { Queue } from "bullmq";
import redis from "./redis.js";

let chatCreationQueue: Queue | null = null;

export function getChatCreationQueue(): Queue {
    if (!chatCreationQueue) {
        chatCreationQueue = new Queue("chatCreation", { connection: redis as any });
    }
    return chatCreationQueue;
}

export async function closeChatCreationQueue(): Promise<void> {
    if (chatCreationQueue) {
        await chatCreationQueue.close();
        chatCreationQueue = null;
    }
}
