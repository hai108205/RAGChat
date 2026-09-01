import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import {
    metricsMiddleware,
    metricsAuthMiddleware,
    checkHealth,
    getPrometheusMetrics,
    contentType,
} from "./utils/metrics.js";
import logger from "./utils/logger.js";
import { ApiError } from "./utils/ApiError.js";

const app = express();

app.use((req: Request, res: Response, next: NextFunction) => {
    const rawHeader = req.headers["x-request-id"];
    const incomingId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    req.id = incomingId || crypto.randomUUID();
    res.setHeader("X-Request-Id", req.id);
    next();
});

app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        logger.info({
            reqId: req.id,
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            duration: `${duration}ms`,
        });
    });
    next();
});

// Prometheus HTTP Metrics Collector
app.use(metricsMiddleware);

// Liveness and readiness health check endpoint
app.get("/healthz", async (req: Request, res: Response) => {
    const { isHealthy, status } = await checkHealth();
    res.status(isHealthy ? 200 : 503).json(status);
});

// Prometheus metrics endpoint
app.get("/metrics", metricsAuthMiddleware, async (req: Request, res: Response) => {
    try {
        res.setHeader("Content-Type", contentType);
        res.end(await getPrometheusMetrics());
    } catch (err: any) {
        res.status(500).end(err?.message || err);
    }
});

app.use(
    cors({
        origin: process.env.CORS_ORIGIN,
        credentials: true,
        methods: process.env.CORS_METHODS,
    }),
);

const jsonLimit = process.env.JSON_BODY_LIMIT || "10mb";
app.use(express.json({ limit: jsonLimit }));
app.use(express.urlencoded({ extended: true, limit: jsonLimit }));
app.use(express.static("public"));
app.use(cookieParser());

// Import Routes
import userRouter from "./routers/user.route.js";
import apikeyRouter from "./routers/apikey.route.js";
import chatRouter from "./routers/chat.route.js";
import chatMessageRouter from "./routers/chatMessage.route.js";
import usageRouter from "./routers/usage.route.js";
import adminRouter from "./routers/admin.route.js";
import rocketchatRouter from "./routers/rocketchatIntegration.route.js";

// Routes Declaration
const ENABLE_WEB_ROUTES = process.env.ENABLE_WEB_ROUTES === "true";

if (ENABLE_WEB_ROUTES) {
    app.use("/api/v1/user", userRouter);
    app.use("/api/v1/apikey", apikeyRouter);
    app.use("/api/v1/chat", chatRouter);
    app.use("/api/v1/chat-message", chatMessageRouter);
    app.use("/api/v1/usage", usageRouter);
    app.use("/api/v1/admin", adminRouter);
}

app.use("/api/v1/integrations/rocketchat", rocketchatRouter);

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        statusCode,
        message: err.message,
        errors: err.errors || [],
    });
});

export { app };
