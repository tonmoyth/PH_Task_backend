import { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../shared/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { AuthService } from "./auth.service";
import { tokenUtils } from "../../utils/token";

// 1. Student Signup
const signup = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.signupStudent(req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Student account created successfully",
    data: result,
  });
});

// 2. User Login
const login = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.loginUser(req.body);

  // Set HTTP-only cookies
  tokenUtils.setRefreshTokenCookie(res, result.refreshToken);
  tokenUtils.setTokenCookie(res, result.accessToken);
  if (result.sessionToken) {
    tokenUtils.setBetterAuthSession(res, result.sessionToken);
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User logged in successfully",
    data: {
      accessToken: result.accessToken,
      mustChangePassword: result.mustChangePassword,
      user: result.user,
    },
  });
});

// 3. User Logout
const logout = catchAsync(async (req: Request, res: Response) => {
  const sessionToken =
    req.cookies?.["better-auth.session_token"] || req.cookies?.sessionToken;

  await AuthService.logoutUser(sessionToken, req.headers);

  // Clear all authentication cookies
  tokenUtils.clearTokensCookies(res);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User logged out successfully",
    data: null,
  });
});

// 4. Token Refresh
const getNewRefreshToken = catchAsync(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

  const result = await AuthService.getNewRefreshToken(refreshToken);

  // Update cookies with renewed tokens
  tokenUtils.setRefreshTokenCookie(res, result.refreshToken);
  tokenUtils.setTokenCookie(res, result.accessToken);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Token refreshed successfully",
    data: {
      accessToken: result.accessToken,
      mustChangePassword: result.mustChangePassword,
    },
  });
});

// 5. Current User Info
const getMe = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const result = await AuthService.getMe(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User profile retrieved successfully",
    data: result,
  });
});

// 6. Change Password
const changePassword = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const result = await AuthService.changePassword(
    userId,
    req.body,
    req.headers,
  );

  // Set updated tokens
  tokenUtils.setRefreshTokenCookie(res, result.refreshToken);
  tokenUtils.setTokenCookie(res, result.accessToken);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password changed successfully",
    data: {
      accessToken: result.accessToken,
    },
  });
});

// 7. Forgot Password
const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.forgotPassword(req.body.email);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

// 8. Reset Password
const resetPassword = catchAsync(async (req: Request, res: Response) => {
  await AuthService.resetPassword(req.body);

  // Clear cookies upon password reset
  tokenUtils.clearTokensCookies(res);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message:
      "Password has been reset successfully. Please log in with your new password.",
    data: null,
  });
});

export const AuthController = {
  signup,
  login,
  logout,
  getNewRefreshToken,
  getMe,
  changePassword,
  forgotPassword,
  resetPassword,
};
