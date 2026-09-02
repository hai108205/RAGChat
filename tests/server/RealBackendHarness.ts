import type { Server } from "http";
import path from "path";
import fs from "fs";

// Load backend test environment variables pointing to live Docker containers
const backendEnvPath = path.resolve(__dirname, "../../backend/.env");
if (fs.existsSync(backendEnvPath)) {
    const content = fs.readFileSync(backendEnvPath, "utf8");
    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if (val.startsWith('"') && val.endsWith('"')) {
                val = val.slice(1, -1);
            }
            if (!process.env[key]) {
                process.env[key] = val;
            }
        }
    }
}

process.env.PORT = process.env.PORT || "8000";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://testuser:testpassword@localhost:5433/docchat_test";
process.env.REDIS_HOST = process.env.REDIS_HOST || "localhost";
process.env.REDIS_PORT = process.env.REDIS_PORT || "6379";
process.env.QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
process.env.ROCKETCHAT_INTEGRATION_TOKEN = process.env.ROCKETCHAT_INTEGRATION_TOKEN || "test-rocketchat-integration-token";

let serverInstance: Server | null = null;
let serverPort = 8000;

export async function startRealBackend(): Promise<{ port: number; baseUrl: string; token: string }> {
    if (serverInstance) {
        return {
            port: serverPort,
            baseUrl: `http://localhost:${serverPort}`,
            token: process.env.ROCKETCHAT_INTEGRATION_TOKEN!,
        };
    }

    const { app } = await import("../../backend/app.js");

    await new Promise<void>((resolve, reject) => {
        try {
            serverInstance = app.listen(Number(process.env.PORT), () => {
                const addr = serverInstance?.address();
                if (addr && typeof addr === "object") {
                    serverPort = addr.port;
                }
                resolve();
            });
        } catch (err) {
            reject(err);
        }
    });

    return {
        port: serverPort,
        baseUrl: `http://localhost:${serverPort}`,
        token: process.env.ROCKETCHAT_INTEGRATION_TOKEN!,
    };
}

export async function stopRealBackend(): Promise<void> {
    if (serverInstance) {
        await new Promise<void>((resolve) => {
            serverInstance?.close(() => {
                serverInstance = null;
                resolve();
            });
        });
    }
}
