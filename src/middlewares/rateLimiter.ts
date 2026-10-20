import { Request, Response, NextFunction } from "express";
import httpStatus from "http-status";
import AppError from "../errors/AppError";
import { redis } from "../config/redis";

const memoryStore = new Map<string, { count: number; expiresAt: number }>();

export const createRateLimiter = (options: {
  keyPrefix: string;
  maxAttempts: number;
  windowSeconds: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const identifier = options.keyGenerator
      ? options.keyGenerator(req)
      : (req.ip || req.socket.remoteAddress || "unknown_ip");
    const key = `ratelimit:${options.keyPrefix}:${identifier}`;
    const { maxAttempts, windowSeconds } = options;
    const errorMessage =
      options.message ||
      `Too many requests. Please try again in ${windowSeconds} seconds.`;

    try {
      if (redis && redis.status === "ready") {
        const current = await redis.incr(key);
        if (current === 1) {
          await redis.expire(key, windowSeconds);
        }
        if (current > maxAttempts) {
          const ttl = await redis.ttl(key);
          throw new AppError(
            httpStatus.TOO_MANY_REQUESTS,
            `Too many requests. Please try again in ${ttl > 0 ? ttl : windowSeconds} seconds.`,
          );
        }
        return next();
      }
    } catch (error) {
      if (error instanceof AppError) {
        return next(error);
      }
      // Fall back to memoryStore if Redis encounters an error
    }

    // Memory fallback
    const now = Date.now();
    const record = memoryStore.get(key);

    if (!record || record.expiresAt < now) {
      memoryStore.set(key, {
        count: 1,
        expiresAt: now + windowSeconds * 1000,
      });
      return next();
    }

    record.count += 1;
    if (record.count > maxAttempts) {
      const remainingSeconds = Math.ceil((record.expiresAt - now) / 1000);
      return next(
        new AppError(
          httpStatus.TOO_MANY_REQUESTS,
          `Too many requests. Please try again in ${remainingSeconds} seconds.`,
        ),
      );
    }

    next();
  };
};

export const loginRateLimiter = createRateLimiter({
  keyPrefix: "login",
  maxAttempts: 5,
  windowSeconds: 60,
  message: "Too many login attempts. Please try again after 1 minute.",
});

export const forgotPasswordRateLimiter = createRateLimiter({
  keyPrefix: "forgot-password",
  maxAttempts: 3,
  windowSeconds: 60,
  message: "Too many password reset requests. Please try again after 1 minute.",
});

export const resetPasswordRateLimiter = createRateLimiter({
  keyPrefix: "reset-password",
  maxAttempts: 5,
  windowSeconds: 60,
  message: "Too many reset attempts. Please try again after 1 minute.",
});

export const submissionRateLimiter = createRateLimiter({
  keyPrefix: "submission",
  maxAttempts: 15,
  windowSeconds: 60,
  keyGenerator: (req: Request) => req.user?.id || req.ip || req.socket.remoteAddress || "unknown",
  message: "Too many submission attempts. Please try again after 1 minute.",
});
