import type { Request, Response, NextFunction, RequestHandler } from "express";
import { ZodType } from "zod";
import { ApiError } from "../utils/ApiError.js";

export interface ValidationSchemas {
    body?: ZodType<any, any, any>;
    params?: ZodType<any, any, any>;
    query?: ZodType<any, any, any>;
    [key: string]: ZodType<any, any, any> | undefined;
}

const validate = (schemas: ValidationSchemas): RequestHandler => {
    return (req: Request, res: Response, next: NextFunction): void => {
        for (const [field, schema] of Object.entries(schemas)) {
            if (!schema) continue;

            const result = schema.safeParse((req as any)[field]);

            if (!result.success) {
                const fieldErrors = result.error.issues.map((issue) => ({
                    field: issue.path.join("."),
                    message: issue.message,
                }));

                const messages = fieldErrors.map((e) => `${e.field}: ${e.message}`);
                throw new ApiError(400, `Validation failed: ${messages.join("; ")}`, fieldErrors);
            }

            Object.defineProperty(req, field, {
                value: result.data,
                writable: true,
                configurable: true,
                enumerable: true,
            });
        }

        next();
    };
};

export default validate;
