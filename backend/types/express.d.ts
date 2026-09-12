import type { ApiKey } from "../generated/prisma/client.js";

export interface AuthenticatedUser {
    id: string;
    fullname?: string | null;
    username?: string | null;
    email?: string | null;
    isAdmin?: boolean;
    apikeys?: ApiKey[];
    refreshToken?: string | null;
}

declare global {
    namespace Express {
        interface Request {
            id?: string;
            user?: AuthenticatedUser | any;
            cookies?: Record<string, string>;
        }
    }
}
