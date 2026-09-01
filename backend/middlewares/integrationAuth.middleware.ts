import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/ApiError.js";
import logger from "../utils/logger.js";

/**
 * Middleware to authenticate requests coming from Rocket.Chat app.
 * Checks Bearer token against ROCKETCHAT_INTEGRATION_TOKEN environment variable.
 */
export const verifyIntegrationToken = (req: Request, res: Response, next: NextFunction): void => {
    const configuredToken = process.env.ROCKETCHAT_INTEGRATION_TOKEN;

    // In development mode, allow proceeding without token if not set
    if (!configuredToken) {
        logger.warn(
            { requestId: req.id },
            "ROCKETCHAT_INTEGRATION_TOKEN is not configured; allowing request in development mode.",
        );
        return next();
    }

    const authHeader = req.headers["authorization"] || req.headers["Authorization"];
    const authHeaderStr = Array.isArray(authHeader) ? authHeader[0] : authHeader;

    if (!authHeaderStr) {
        throw new ApiError(401, "Missing Authorization header for integration request.");
    }

    const match = authHeaderStr.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        throw new ApiError(401, "Invalid Authorization header format. Expected Bearer token.");
    }

    const token = match[1].trim();
    if (token !== configuredToken) {
        throw new ApiError(401, "Invalid integration token.");
    }

    next();
};
