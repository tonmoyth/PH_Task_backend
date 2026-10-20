import { Request, Response, NextFunction } from "express";
import httpStatus from "http-status";
import { fromNodeHeaders } from "better-auth/node";
import { catchAsync } from "../shared/catchAsync";
import { prisma } from "../lib/prisma";
import AppError from "../errors/AppError";
import { jwtUtils } from "../utils/jwtUtils";
import { envVeriables } from "../config/envConfig";
import { auth } from "../lib/auth";

declare global {
  namespace Express {
    interface Request {
      user?: any;
      session?: any;
    }
  }
}

export const checkAuth = (...requiredRoles: string[]) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    let user: any = null;

    // 1. Try resolving user from JWT access token (Header or Cookie)
    const token =
      req.cookies?.accessToken ||
      req.headers.authorization?.split(" ")[1];

    if (token) {
      const result = jwtUtils.verifyToken(token, envVeriables.JWT_SECRET_KEY);
      if (result.seccess && result.data) {
        const decoded = result.data as { id?: string; email?: string };
        if (decoded.id || decoded.email) {
          user = await prisma.user.findUnique({
            where: decoded.id ? { id: decoded.id } : { email: decoded.email! },
          });
        }
      }
    }

    // 2. If no valid JWT, fall back to Better Auth session
    if (!user) {
      try {
        const headers = fromNodeHeaders(req.headers);
        const sessionData = await auth.api.getSession({
          headers,
        });
        if (sessionData && sessionData.user) {
          user = await prisma.user.findUnique({
            where: { id: sessionData.user.id },
          });
          req.session = sessionData.session;
        }
      } catch {
        // Session lookup failed, user remains null
      }
    }

    // 3. Reject unauthenticated request
    if (!user) {
      throw new AppError(
        httpStatus.UNAUTHORIZED,
        "You are not authorized. Please log in.",
      );
    }

    // 4. Check banned status
    if (user.banned) {
      if (user.banExpires && user.banExpires < new Date()) {
        await prisma.user.update({
          where: { id: user.id },
          data: { banned: false, banReason: null, banExpires: null },
        });
      } else {
        throw new AppError(
          httpStatus.FORBIDDEN,
          `Account is banned.${user.banReason ? ` Reason: ${user.banReason}` : ""}`,
        );
      }
    }

    // 5. Check active status
    if (user.isActive === false) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        "Account is deactivated. Please contact administrator.",
      );
    }

    // 6. Role check
    if (requiredRoles.length > 0) {
      const userRole = (user.role || "").toUpperCase();
      const allowedRoles = requiredRoles.map((r) => r.toUpperCase());
      if (!allowedRoles.includes(userRole)) {
        throw new AppError(
          httpStatus.FORBIDDEN,
          "You do not have permission to access this resource",
        );
      }
    }

    req.user = user;
    next();
  });
};