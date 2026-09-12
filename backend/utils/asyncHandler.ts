import type { Request, Response, NextFunction, RequestHandler } from "express";

type AsyncFunction = (req: Request, res: Response, next: NextFunction) => Promise<any> | any;

const asyncHandler = (fn: AsyncFunction): RequestHandler => {
    return (req: Request, res: Response, next: NextFunction): void => {
        Promise.resolve(fn(req, res, next)).catch((error) => {
            next(error);
        });
    };
};

export default asyncHandler;
