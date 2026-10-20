import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import AppError from "../errors/AppError";
import { prisma } from "../lib/prisma";
import { jwtUtils } from "../utils/jwtUtils";
import { envVeriables } from "../config/envConfig";
import { cookieUtil } from "../utils/cookie";

declare global {
  namespace Express {
    interface Request {
      user?: any;
      session?: any;
    }
  }
}

export const checkAuth = (...requiredRoles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      let user: any = null;

      // 1. Get access token from cookie or Authorization header
      const accessToken =
        cookieUtil.getCookie(req, "accessToken") ||
        req.headers.authorization?.split(" ")[1];

      // 2. If access token exists, verify JWT and find user
      if (accessToken) {
        const decoded = jwtUtils.verifyToken(
          accessToken,
          envVeriables.JWT_SECRET_KEY,
        );
        if (decoded.seccess && decoded.data) {
          const payload = decoded.data as { id?: string; email?: string };
          user = await prisma.user.findUnique({
            where: payload.id ? { id: payload.id } : { email: payload.email! },
          });
        }
      }

      // 3. If no user from JWT, fall back to Better Auth session cookie
      if (!user) {
        const sessionToken =
          cookieUtil.getCookie(req, "better-auth.session_token") ||
          cookieUtil.getCookie(req, "__Secure-session_token") ||
          cookieUtil.getCookie(req, "sessionToken");

        if (sessionToken) {
          const session = await prisma.session.findFirst({
            where: {
              token: sessionToken,
              expiresAt: { gt: new Date() },
            },
            include: {
              user: true,
            },
          });

          if (session?.user) {
            user = session.user;
            req.session = session;
          }
        }
      }

      // 4. Reject unauthenticated request
      if (!user) {
        throw new AppError(
          httpStatus.UNAUTHORIZED,
          "You are not authorized. Please log in.",
        );
      }

      // 5. Check if user account is deactivated
      if (user.isActive === false) {
        throw new AppError(
          httpStatus.FORBIDDEN,
          "Account is deactivated. Please contact administrator.",
        );
      }

      // 6. Role authorization check
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

      // 7. Attach user to request context
      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
};

export default checkAuth;