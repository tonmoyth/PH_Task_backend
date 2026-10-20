import httpStatus from "http-status";
import { fromNodeHeaders } from "better-auth/node";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { auth } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import AppError from "../../errors/AppError";
import { tokenUtils } from "../../utils/token";
import { jwtUtils } from "../../utils/jwtUtils";
import { envVeriables } from "../../config/envConfig";

interface ISignupPayload {
  name: string;
  email: string;
  password: string;
}

interface ILoginPayload {
  email: string;
  password: string;
}

interface IChangePasswordPayload {
  oldPassword?: string;
  currentPassword?: string;
  newPassword: string;
}

interface IResetPasswordPayload {
  email?: string;
  code?: string;
  otp?: string;
  token?: string;
  newPassword: string;
}

// 1. Student Signup (Server enforces role: STUDENT)
const signupStudent = async (payload: ISignupPayload) => {
  const normalizedEmail = payload.email.toLowerCase().trim();

  // Check if email is already registered
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    throw new AppError(httpStatus.CONFLICT, "Email already exists");
  }

  try {
    const result = await auth.api.signUpEmail({
      body: {
        name: payload.name.trim(),
        email: normalizedEmail,
        password: payload.password,
      },
    });

    if (!result || !result.user) {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to create user account",
      );
    }

    // Guarantee role is STUDENT
    if (result.user.role !== "STUDENT") {
      await prisma.user.update({
        where: { id: result.user.id },
        data: { role: "STUDENT" },
      });
    }

    return {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      role: "STUDENT",
      createdAt: result.user.createdAt,
    };
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    const message =
      error.body?.message || error.message || "Failed to create account";
    const statusCode = error.statusCode || httpStatus.BAD_REQUEST;
    throw new AppError(statusCode, message);
  }
};

// 2. User Login (Authenticates credentials via Better Auth)
const loginUser = async (payload: ILoginPayload) => {
  const normalizedEmail = payload.email.toLowerCase().trim();

  let authResult;
  try {
    authResult = await auth.api.signInEmail({
      body: {
        email: normalizedEmail,
        password: payload.password,
      },
    });
  } catch {
    // Return generic authentication error to prevent email enumeration
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid email or password");
  }

  if (!authResult || !authResult.user) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid email or password");
  }

  // Check if account is banned
  const user = await prisma.user.findUnique({
    where: { id: authResult.user.id },
  });

  if (!user) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid email or password");
  }

  if (user.banned) {
    if (user.banExpires && user.banExpires < new Date()) {
      await prisma.user.update({
        where: { id: user.id },
        data: { banned: false, banReason: null, banExpires: null },
      });
    } else {
      throw new AppError(
        httpStatus.FORBIDDEN,
        `Your account has been banned.${user.banReason ? ` Reason: ${user.banReason}` : ""}`,
      );
    }
  }

  // Issue JWT Access Token & Refresh Token
  const jwtPayload = {
    id: user.id,
    email: user.email,
    role: user.role || "STUDENT",
  };

  const accessToken = tokenUtils.getToken(jwtPayload);
  const refreshToken = tokenUtils.getRefreshToken(jwtPayload);

  return {
    accessToken,
    refreshToken,
    sessionToken: authResult.token,
    mustChangePassword: user.mustChangePassword,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role || "STUDENT",
      mustChangePassword: user.mustChangePassword,
    },
  };
};

// 3. User Logout (Revoke session via Better Auth and Prisma)
const logoutUser = async (sessionToken?: string, headers?: any) => {
  if (sessionToken) {
    await prisma.session.deleteMany({
      where: { token: sessionToken },
    });
  }

  if (headers) {
    try {
      await auth.api.signOut({ headers: fromNodeHeaders(headers) });
    } catch {
      // Ignore if session is already invalidated
    }
  }

  return null;
};

// 4. Token Refresh (Rotating JWT access and refresh tokens)
const getNewRefreshToken = async (refreshToken: string) => {
  if (!refreshToken) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Refresh token is required");
  }

  const verifyResult = jwtUtils.verifyToken(
    refreshToken,
    envVeriables.JWT_REFRESH_SECRET_KEY,
  );

  if (!verifyResult || !verifyResult.seccess || !verifyResult.data) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      "Invalid or expired refresh token. Please login again.",
    );
  }

  const data = verifyResult.data as { id: string; email: string; role: string };

  const user = await prisma.user.findUnique({
    where: { id: data.id },
  });

  if (!user) {
    throw new AppError(httpStatus.UNAUTHORIZED, "User not found");
  }

  if (user.banned) {
    throw new AppError(httpStatus.FORBIDDEN, "Account is banned");
  }

  const jwtPayload = {
    id: user.id,
    email: user.email,
    role: user.role || "STUDENT",
  };

  const accessToken = tokenUtils.getToken(jwtPayload);
  const newRefreshToken = tokenUtils.getRefreshToken(jwtPayload);

  return {
    accessToken,
    refreshToken: newRefreshToken,
    mustChangePassword: user.mustChangePassword,
  };
};

// 5. Current User Info
const getMe = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      mustChangePassword: true,
    },
  });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  return user;
};

// 6. Change Password (Works with JWT Bearer Token & Better Auth sessions)
const changePassword = async (
  userId: string,
  payload: IChangePasswordPayload,
  reqHeaders?: any,
) => {
  const currentPassword = payload.oldPassword || payload.currentPassword;

  if (!currentPassword) {
    throw new AppError(httpStatus.BAD_REQUEST, "Old password is required");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  // Find user's credential account
  const account = await prisma.account.findFirst({
    where: {
      userId,
      providerId: "credential",
    },
  });

  if (!account || !account.password) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "No password set for this account",
    );
  }

  // Verify current password using Better Auth's password verifier
  const isCurrentPasswordValid = await verifyPassword({
    hash: account.password,
    password: currentPassword,
  });

  if (!isCurrentPasswordValid) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Current password is incorrect",
    );
  }

  // Hash new password using Better Auth's standard algorithm
  const newPasswordHash = await hashPassword(payload.newPassword);

  // Update account password in database
  await prisma.account.update({
    where: { id: account.id },
    data: { password: newPasswordHash },
  });

  // Set mustChangePassword to false upon successful password change
  await prisma.user.update({
    where: { id: userId },
    data: { mustChangePassword: false },
  });

  // Revoke all existing sessions for security
  await prisma.session.deleteMany({
    where: { userId },
  });

  const jwtPayload = {
    id: user.id,
    email: user.email,
    role: user.role || "STUDENT",
  };

  const accessToken = tokenUtils.getToken(jwtPayload);
  const refreshToken = tokenUtils.getRefreshToken(jwtPayload);

  return {
    accessToken,
    refreshToken,
  };
};

// 7. Forgot Password (Sends a 6-digit verification code to email)
const forgotPassword = async (email: string) => {
  const normalizedEmail = email.toLowerCase().trim();

  try {
    await auth.api.requestPasswordResetEmailOTP({
      body: {
        email: normalizedEmail,
      },
    });
  } catch (error) {
    // Log only safe diagnostic information without leaking user existence
    console.error("Diagnostic: requestPasswordResetEmailOTP error:", error);
  }

  // Security requirement: Same response regardless of whether account exists
  return {
    message:
      "If an account exists for this email, a verification code has been sent.",
  };
};

// 8. Reset Password (Reset password using verification code/OTP)
const resetPassword = async (payload: IResetPasswordPayload) => {
  const rawCode = (payload.code || payload.otp || payload.token)?.trim();

  if (!rawCode) {
    throw new AppError(httpStatus.BAD_REQUEST, "Verification code is required");
  }

  const otpCode = rawCode.split(":")[0];

  // Resolve target email
  let targetEmail = payload.email?.toLowerCase().trim();

  if (!targetEmail) {
    const verification = await prisma.verification.findFirst({
      where: {
        OR: [
          { value: otpCode },
          { value: { startsWith: `${otpCode}:` } },
        ],
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!verification) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Invalid or expired verification code",
      );
    }

    targetEmail = verification.identifier.replace(/^.*-otp-/, "").trim();
  }

  try {
    await auth.api.resetPasswordEmailOTP({
      body: {
        email: targetEmail,
        otp: otpCode,
        password: payload.newPassword,
      },
    });
  } catch (error: any) {
    const message =
      error.body?.message ||
      error.message ||
      "Invalid or expired verification code";
    throw new AppError(httpStatus.BAD_REQUEST, message);
  }

  // Set mustChangePassword to false and revoke other sessions
  const user = await prisma.user.findUnique({ where: { email: targetEmail } });
  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { mustChangePassword: false },
    });
    await prisma.session.deleteMany({
      where: { userId: user.id },
    });
  }

  return null;
};

export const AuthService = {
  signupStudent,
  loginUser,
  getNewRefreshToken,
  logoutUser,
  getMe,
  changePassword,
  forgotPassword,
  resetPassword,
};
