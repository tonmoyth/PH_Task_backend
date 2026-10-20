import { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";

const validateRequest = (schema: ZodSchema) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            await schema.parseAsync({
                body: req.body,
                query: req.query,
                params: req.params,
                cookies: req.cookies,
            });
            next();
        } catch (error: any) {
            next(error);
        }
    };
};

export default validateRequest;
