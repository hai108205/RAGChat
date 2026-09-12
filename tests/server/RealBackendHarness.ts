import type { Server } from "http";
import * as path from "path";
import * as fs from "fs";
import * as net from "net";

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

function checkTcpPort(host: string, port: number, timeoutMs = 800): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let status = false;
        socket.setTimeout(timeoutMs);
        socket.once("connect", () => {
            status = true;
            socket.destroy();
            resolve(true);
        });
        socket.once("timeout", () => {
            socket.destroy();
            resolve(false);
        });
        socket.once("error", () => {
            socket.destroy();
            resolve(false);
        });
        socket.connect(port, host);
    });
}

export async function checkBackendInfrastructure(): Promise<{ ok: boolean; missing: string[] }> {
    const redisHost = process.env.REDIS_HOST || "localhost";
    const redisPort = Number(process.env.REDIS_PORT) || 6379;

    let pgHost = "localhost";
    let pgPort = 5433;
    try {
        const url = new URL(process.env.DATABASE_URL || "");
        pgHost = url.hostname || "localhost";
        pgPort = Number(url.port) || 5432;
    } catch {
        // use default
    }

    const [redisOk, pgOk] = await Promise.all([
        checkTcpPort(redisHost, redisPort),
        checkTcpPort(pgHost, pgPort),
    ]);

    const missing: string[] = [];
    if (!redisOk) missing.push(`Redis (${redisHost}:${redisPort})`);
    if (!pgOk) missing.push(`PostgreSQL (${pgHost}:${pgPort})`);

    return {
        ok: missing.length === 0,
        missing,
    };
}

export async function startRealBackend(): Promise<{ port: number; baseUrl: string; token: string }> {
    if (serverInstance) {
        return {
            port: serverPort,
            baseUrl: `http://localhost:${serverPort}`,
            token: process.env.ROCKETCHAT_INTEGRATION_TOKEN!,
        };
    }

    const health = await checkBackendInfrastructure();
    if (!health.ok) {
        throw new Error(
            `[RealBackendHarness] Fast-fail preflight: Docker infrastructure is not reachable.\n` +
            `Unreachable services: ${health.missing.join(", ")}.\n` +
            `Actionable resolution: Start dependencies with 'docker compose up -d' before running Docker integration tests.`
        );
    }

    const backendAppPath = path.resolve(__dirname, "../../backend/app.js");
    const { app } = await import(backendAppPath);

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
