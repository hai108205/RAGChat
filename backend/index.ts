import "dotenv/config";
import connectDB from "./utils/connectDB.js";
import { app } from "./app.js";
import validateEnv from "./utils/validateEnv.js";
import prisma from "./utils/prismaClient.js";
import redis from "./utils/redis.js";
import { closeChatCreationQueue } from "./utils/queue.js";
import type { Server } from "node:http";

validateEnv();

const PORT = process.env.PORT || 8000;
let server: Server;

connectDB()
    .then(() => {
        server = app.listen(PORT, () => {
            console.log(`Server is running at port : ${PORT}`);
        });
    })
    .catch((err) => {
        console.log("Postgres connection failed :", err);
    });

let isShuttingDown = false;

async function handleGracefulShutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\nReceived ${signal}. Gracefully shutting down...`);

    const forceExitTimeout = setTimeout(() => {
        console.error("Forcing shutdown after timeout expired.");
        process.exit(1);
    }, 10000);

    try {
        if (server) {
            await new Promise<void>((resolve, reject) => {
                server.close((err) => {
                    if (err) return reject(err);
                    console.log("HTTP server closed.");
                    resolve();
                });
            });
        }

        await closeChatCreationQueue();
        console.log("BullMQ queue connection closed.");

        await redis.quit().catch(() => {});
        console.log("Redis connection closed.");

        await prisma.$disconnect();
        console.log("Prisma client disconnected.");

        clearTimeout(forceExitTimeout);
        console.log("Graceful shutdown completed.");
        process.exit(0);
    } catch (error) {
        console.error("Error during graceful shutdown:", error);
        clearTimeout(forceExitTimeout);
        process.exit(1);
    }
}

process.on("SIGINT", () => handleGracefulShutdown("SIGINT"));
process.on("SIGTERM", () => handleGracefulShutdown("SIGTERM"));
