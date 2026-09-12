import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import prisma from "../utils/prismaClient.js";
import { ApiError } from "../utils/ApiError.js";
import { config } from "../config/runtime.js";

interface DecodedToken {
    id: string;
    username?: string;
    fullname?: string;
    [key: string]: any;
}

const verifyStrictJWT = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const token =
            req.cookies?.accessToken ||
            req.header("Authorization")?.replace("Bearer ", "") ||
            (typeof req.query?.token === "string" ? req.query.token : undefined);

        if (!token) {
            throw new ApiError(401, "Unauthorised request");
        }

        const secret = config.auth.accessTokenSecret;
        const decodedToken = jwt.verify(token, secret) as DecodedToken;
        const user = await prisma.user.findUnique({
            where: { id: decodedToken.id },
            select: {
                id: true,
                fullname: true,
                username: true,
                email: true,
                isAdmin: true,
                apikeys: true,
                refreshToken: true,
            },
        });

        if (!user) throw new ApiError(401, "Invalid Access Token");

        req.user = user;
        next();
    } catch (error) {
        console.error("VERIFY JWT ERROR:", error);
        next(error);
    }
};

const verifyJWT = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token =
        req.cookies?.accessToken ||
        req.header("Authorization")?.replace("Bearer ", "") ||
        (typeof req.query?.token === "string" ? req.query.token : undefined);

    if (token) {
        try {
            const secret = config.auth.accessTokenSecret;
            const decodedToken = jwt.verify(token, secret) as DecodedToken;
            const user = await prisma.user.findUnique({
                where: { id: decodedToken.id },
                select: {
                    id: true,
                    fullname: true,
                    username: true,
                    email: true,
                },
            });
            if (user) req.user = user;
        } catch {
            // Ignore token errors for non-strict verify
        }
    }
    next();
};

const verifyAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        if (req.user?.isAdmin !== true) {
            throw new ApiError(403, "Admin privileges required");
        }

        next();
    } catch (error) {
        next(error instanceof ApiError ? error : new ApiError(403, "Admin privileges required"));
    }
};

export { verifyStrictJWT, verifyJWT, verifyAdmin };
