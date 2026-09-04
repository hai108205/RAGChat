import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { ApiError } from "../utils/ApiError.js";
import logger from "../utils/logger.js";
import { config } from "../config/runtime.js";

/**
 * Timing-safe string comparison to prevent timing attacks.
 * Hashes inputs with SHA-256 to ensure identical buffer lengths.
 */
function timingSafeCompare(a: string, b: string): boolean {
    const aHash = crypto.createHash("sha256").update(a).digest();
    const bHash = crypto.createHash("sha256").update(b).digest();
    return crypto.timingSafeEqual(aHash, bHash);
}

/**
 * Middleware to authenticate requests coming from Rocket.Chat app.
 * Checks Bearer token against ROCKETCHAT_INTEGRATION_TOKEN environment variable.
 * Fails closed in production and by default in non-production unless explicitly allowed.
 */
export const verifyIntegrationToken = (req: Request, res: Response, next: NextFunction): void => {
    const configuredToken = config.rocketchat.integrationToken;
    const isProd = config.environment === "production";
    const allowDev = config.rocketchat.allowUnauthenticatedDev;

    if (!configuredToken) {
        if (!isProd && allowDev) {
            logger.warn(
                { requestId: req.id },
                "ROCKETCHAT_INTEGRATION_TOKEN is not configured; allowing unauthenticated request because ALLOW_UNAUTHENTICATED_ROCKETCHAT_DEV=true in non-production mode.",
            );
            return next();
        }
        throw new ApiError(401, "Integration authentication failed: ROCKETCHAT_INTEGRATION_TOKEN is not configured.");
    }

    const authHeader = req.headers["authorization"] || req.headers["Authorization"];
    const authHeaderStr = Array.isArray(authHeader) ? authHeader[0] : authHeader;

    if (!authHeaderStr) {
        if (!isProd && allowDev) {
            logger.warn(
                { requestId: req.id },
                "Missing Authorization header; allowing request because ALLOW_UNAUTHENTICATED_ROCKETCHAT_DEV=true in non-production mode.",
            );
            return next();
        }
        throw new ApiError(401, "Missing Authorization header for integration request.");
    }

    const match = authHeaderStr.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        if (!isProd && allowDev) {
            logger.warn(
                { requestId: req.id },
                "Invalid Authorization header format; allowing request because ALLOW_UNAUTHENTICATED_ROCKETCHAT_DEV=true in non-production mode.",
            );
            return next();
        }
        throw new ApiError(401, "Invalid Authorization header format. Expected Bearer token.");
    }

    const token = match[1].trim();
    if (!timingSafeCompare(token, configuredToken)) {
        if (!isProd && allowDev) {
            logger.warn(
                { requestId: req.id },
                "Invalid integration token; allowing request because ALLOW_UNAUTHENTICATED_ROCKETCHAT_DEV=true in non-production mode.",
            );
            return next();
        }
        throw new ApiError(401, "Invalid integration token.");
    }

    next();
};
