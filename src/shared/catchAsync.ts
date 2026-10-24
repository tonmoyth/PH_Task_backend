import e, { NextFunction, Request, RequestHandler, Response } from "express";
import AppError from "../errors/AppError";


export const catchAsync = (fn: RequestHandler) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            await fn(req, res, next);
        } catch (error) {
            next(error)
        }
    };
};

