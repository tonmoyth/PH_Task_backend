import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import AppError from "../errors/AppError";
import { jwtUtils } from "../utils/jwtUtils";
import { envVeriables } from "../config/envConfig";
import { prisma } from "../lib/prisma";

declare global {
  namespace Express {
    interface Request {
      user?: any
    }
  }
}

export const checkAuth = (...requiredRoles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      let user: any = null

      const accessToken = req.cookies?.["accessToken"] || req.headers.authorization?.split(" ")[1]

      if (!accessToken) {
        throw new AppError(httpStatus.UNAUTHORIZED, "You are not authorized")
      }

      const decoded = jwtUtils.verifyToken(accessToken, envVeriables.JWT_SECRET_KEY)

      if (decoded.seccess && decoded.data) {
        const payload = decoded.data as { id: string, email: string }

        user = await prisma.user.findUnique({
          where: {
            id: payload.id
          }
        })
      }

      if (!user) {
        throw new AppError(httpStatus.UNAUTHORIZED, "You are not authorized")
      }

      if (user.isActive === false) {
        throw new AppError(httpStatus.FORBIDDEN, "Your account is inactive")
      }

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

      req.user = user
      next()

    } catch (error) {
      next(error)
    }
  }
}