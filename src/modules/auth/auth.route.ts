import express from "express";
import { AuthController } from "./auth.controller";
import { checkAuth } from "../../middlewares/checkAuth";
import validateRequest from "../../middlewares/validateRequest";
import {
  loginRateLimiter,
  forgotPasswordRateLimiter,
  resetPasswordRateLimiter,
} from "../../middlewares/rateLimiter";
import { AuthValidation } from "./auth.validation";

const router = express.Router();

// 1. Student Signup (Public)
router.post(
  "/signup",
  validateRequest(AuthValidation.signupZodSchema),
  AuthController.signup,
);

// 2. User Login (Public, Rate-limited)
router.post(
  "/login",
  loginRateLimiter,
  validateRequest(AuthValidation.loginZodSchema),
  AuthController.login,
);

// 3. User Logout (Authenticated)
router.post("/logout", checkAuth(), AuthController.logout);

// 4. Refresh Token (Public, valid refresh cookie required)
router.post("/refresh", AuthController.getNewRefreshToken);

// 5. Current User Info (Authenticated)
router.get("/me", checkAuth(), AuthController.getMe);

// 6. Change Password (Authenticated)
router.post(
  "/change-password",
  checkAuth(),
  validateRequest(AuthValidation.changePasswordZodSchema),
  AuthController.changePassword,
);

// 7. Forgot Password (Public, Rate-limited)
router.post(
  "/forgot-password",
  forgotPasswordRateLimiter,
  validateRequest(AuthValidation.forgotPasswordZodSchema),
  AuthController.forgotPassword,
);

// 8. Reset Password (Public, Rate-limited)
router.post(
  "/reset-password",
  resetPasswordRateLimiter,
  validateRequest(AuthValidation.resetPasswordZodSchema),
  AuthController.resetPassword,
);

export const AuthRoutes = router;

