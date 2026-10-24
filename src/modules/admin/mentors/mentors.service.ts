import crypto from "crypto";
import httpStatus from "http-status";
import { hashPassword } from "better-auth/crypto";
import { auth } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import AppError from "../../../errors/AppError";
import { QueryBuilder } from "../../../utils/queryBuilder";
import { emailService } from "../../../utils/email.util";
import { IQueryParams } from "../../../interface/queryBuilder.interface";
import { User } from "../../../generated/prisma/client";
import {
  ICreateMentorPayload,
  IUpdateMentorPayload,
  IMentorResponse,
  IMentorDetailResponse,
} from "./mentors.interface";
import {
  mentorSearchableFields,
  mentorFilterableFields,
  mentorSafeSelectFields,
  MAX_PAGE_LIMIT,
} from "./mentors.constant";

/**
 * Generates a cryptographically secure, sufficiently random temporary password.
 * Guaranteed to satisfy length >= 16 and contain uppercase, lowercase, numbers, and symbols.
 */
export const generateSecureTemporaryPassword = (length = 16): string => {
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowercase = "abcdefghijkmnopqrstuvwxyz";
  const numbers = "23456789";
  const symbols = "!@#$%^&*()_+-=";
  const allChars = uppercase + lowercase + numbers + symbols;

  const passwordChars = [
    uppercase[crypto.randomInt(0, uppercase.length)],
    lowercase[crypto.randomInt(0, lowercase.length)],
    numbers[crypto.randomInt(0, numbers.length)],
    symbols[crypto.randomInt(0, symbols.length)],
  ];

  const targetLength = Math.max(length, 12);
  for (let i = passwordChars.length; i < targetLength; i++) {
    passwordChars.push(allChars[crypto.randomInt(0, allChars.length)]);
  }

  for (let i = passwordChars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [passwordChars[i], passwordChars[j]] = [passwordChars[j], passwordChars[i]];
  }

  return passwordChars.join("");
};

/**
 * 1. POST /admin/mentors — Create Mentor
 * Requires authenticated ADMIN access.
 * Creates Better Auth-compatible credential account, sets mustChangePassword=true, isActive=true,
 * delivers credentials via email service, and rolls back account creation if email delivery fails.
 */
const createMentor = async (
  adminUserId: string,
  payload: ICreateMentorPayload,
): Promise<IMentorResponse> => {
  const normalizedEmail = payload.email.toLowerCase().trim();
  const trimmedName = payload.name.trim();

  // 1. Check whether email is already registered
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    throw new AppError(httpStatus.CONFLICT, "Email already exists");
  }

  // 2. Generate cryptographically secure temporary password
  const temporaryPassword = generateSecureTemporaryPassword();

  // 3. Create user and credential account using Better Auth API
  let createdUser: any;
  try {
    let authResult: any;
    if (typeof (auth.api as any).createUser === "function") {
      authResult = await (auth.api as any).createUser({
        body: {
          name: trimmedName,
          email: normalizedEmail,
          password: temporaryPassword,
          role: "user" as any,
          data: {
            role: "MENTOR",
            mustChangePassword: true,
            isActive: true,
            createdById: adminUserId,
          },
        },
      });
    } else {
      authResult = await auth.api.signUpEmail({
        body: {
          name: trimmedName,
          email: normalizedEmail,
          password: temporaryPassword,
        },
      });
    }

    if (!authResult || !authResult.user) {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to create mentor account in authentication system",
      );
    }

    createdUser = authResult.user;

    // Explicitly guarantee all fields on the User model
    await prisma.user.update({
      where: { id: createdUser.id },
      data: {
        role: "MENTOR",
        mustChangePassword: true,
        isActive: true,
        createdById: adminUserId,
      },
    });
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    // Map Better Auth duplicate errors to 409
    const msg = error.body?.message || error.message || "";
    if (msg.toLowerCase().includes("already exists") || error.statusCode === 409) {
      throw new AppError(httpStatus.CONFLICT, "Email already exists");
    }
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to create mentor account: ${msg || "Unknown error"}`,
    );
  }

  // 4. Send credentials email with compensating rollback on failure
  try {
    await emailService.sendMentorCredentialsEmail({
      name: trimmedName,
      email: normalizedEmail,
      temporaryPassword,
    });
  } catch (emailError: any) {
    // Safe compensating rollback: delete created account, sessions, and user record
    try {
      await prisma.$transaction(async (tx) => {
        const target = await tx.user.findUnique({
          where: { id: createdUser.id },
        });

        // Ensure rollback cannot delete an unrelated or pre-existing account
        if (
          target &&
          target.email === normalizedEmail &&
          target.role === "MENTOR"
        ) {
          await tx.session.deleteMany({ where: { userId: createdUser.id } });
          await tx.account.deleteMany({ where: { userId: createdUser.id } });
          await tx.user.delete({ where: { id: createdUser.id } });
        }
      });
    } catch (cleanupError: any) {
      console.error(
        "Critical Error: Failed to roll back newly created mentor account after email delivery failure:",
        cleanupError.message || cleanupError,
      );
    }

    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to deliver login credentials email. Account creation has been rolled back.",
    );
  }

  // 5. Return safe mentor profile without exposing credentials or hashes
  const freshUser = await prisma.user.findUnique({
    where: { id: createdUser.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return freshUser as IMentorResponse;
};

/**
 * 2. GET /admin/mentors — List Mentors
 * Supports pagination, searching by name and email, and filtering by isActive.
 * Returns only MENTOR accounts with safe fields and pagination metadata.
 */
const listMentors = async (queryParams: IQueryParams) => {
  const sanitizedParams: IQueryParams = { ...queryParams };

  // Map 'search' query parameter to 'searchTerm' for QueryBuilder compatibility
  if (sanitizedParams.search && !sanitizedParams.searchTerm) {
    sanitizedParams.searchTerm = String(sanitizedParams.search).trim();
  }

  // Enforce reasonable maximum page size
  if (sanitizedParams.limit) {
    const parsedLimit = Number(sanitizedParams.limit);
    if (!isNaN(parsedLimit) && parsedLimit > MAX_PAGE_LIMIT) {
      sanitizedParams.limit = String(MAX_PAGE_LIMIT);
    }
  }

  // Select only safe fields to prevent sensitive credential leaks
  sanitizedParams.fields = mentorSafeSelectFields;

  const queryBuilder = new QueryBuilder<User>(
    prisma.user,
    sanitizedParams,
    {
      searchableFields: mentorSearchableFields,
      filterableFields: mentorFilterableFields,
    },
  )
    .where({ role: { in: ["MENTOR", "mentor"] } })
    .search()
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await queryBuilder.execute();
  return result;
};

/**
 * 3. GET /admin/mentors/:id — Mentor Details
 * Retrieves a mentor's details and the total number of reviews performed by that mentor.
 * Uses Prisma's aggregate _count on reviewedSubmissions without loading reviews into memory.
 */
const getMentorById = async (id: string): Promise<IMentorDetailResponse> => {
  const mentor = await prisma.user.findFirst({
    where: {
      id,
      role: { in: ["MENTOR", "mentor"] },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          reviewedSubmissions: true,
        },
      },
    },
  });

  if (!mentor) {
    throw new AppError(httpStatus.NOT_FOUND, "Mentor not found");
  }

  const { _count, ...safeData } = mentor;
  return {
    ...safeData,
    totalReviews: _count.reviewedSubmissions,
  };
};

/**
 * 4. PATCH /admin/mentors/:id — Update Mentor
 * Allows Admin to update mentor name or activate/deactivate the account.
 * When deactivated:
 * - isActive is set to false
 * - Active sessions are revoked
 * - Subsequent requests via JWT or sessions are rejected with 403 Forbidden by checkAuth
 */
const updateMentor = async (
  id: string,
  payload: IUpdateMentorPayload,
): Promise<IMentorResponse> => {
  // Ensure target exists and is a Mentor
  const mentor = await prisma.user.findFirst({
    where: {
      id,
      role: { in: ["MENTOR", "mentor"] },
    },
  });

  if (!mentor) {
    throw new AppError(httpStatus.NOT_FOUND, "Mentor not found");
  }

  const updateData: { name?: string; isActive?: boolean } = {};

  if (payload.name !== undefined) {
    updateData.name = payload.name.trim();
  }

  if (payload.isActive !== undefined) {
    updateData.isActive = payload.isActive;
  }

  // Deactivation behavior: revoke active sessions
  if (payload.isActive === false) {
    await prisma.session.deleteMany({
      where: { userId: id },
    });
  }

  const updatedMentor = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return updatedMentor as IMentorResponse;
};

/**
 * 5. POST /admin/mentors/:id/reset-password — Reset Mentor Password
 * Generates a new secure temporary password, hashes it using Better Auth's standard algorithm,
 * sets mustChangePassword=true, and sends credentials to the mentor's email.
 * If email delivery fails, performs a compensating rollback restoring the previous password hash.
 * Invalidates existing sessions upon successful delivery.
 */
const resetMentorPassword = async (id: string) => {
  // 1. Verify mentor exists and has role MENTOR
  const mentor = await prisma.user.findFirst({
    where: {
      id,
      role: { in: ["MENTOR", "mentor"] },
    },
    include: {
      accounts: {
        where: { providerId: "credential" },
      },
    },
  });

  if (!mentor) {
    throw new AppError(httpStatus.NOT_FOUND, "Mentor not found");
  }

  // 2. Generate new cryptographically secure temporary password
  const temporaryPassword = generateSecureTemporaryPassword();

  // 3. Hash temporary password using Better Auth's standard hashing mechanism
  const newHashedPassword = await hashPassword(temporaryPassword);

  // 4. Preserve previous credential state for compensating rollback
  const credentialAccount = mentor.accounts[0];
  const previousPasswordHash = credentialAccount?.password;
  const previousMustChangePassword = mentor.mustChangePassword;

  // 5. Update credential record and set mustChangePassword = true
  if (credentialAccount) {
    await prisma.account.update({
      where: { id: credentialAccount.id },
      data: { password: newHashedPassword },
    });
  } else {
    await prisma.account.create({
      data: {
        id: crypto.randomUUID(),
        userId: mentor.id,
        providerId: "credential",
        accountId: mentor.id,
        password: newHashedPassword,
      },
    });
  }

  await prisma.user.update({
    where: { id: mentor.id },
    data: { mustChangePassword: true },
  });

  // 6. Deliver new credentials to mentor's email
  try {
    await emailService.sendMentorPasswordResetEmail({
      name: mentor.name,
      email: mentor.email,
      temporaryPassword,
    });
  } catch (emailError: any) {
    // Compensating rollback: restore previous password hash and mustChangePassword
    try {
      if (credentialAccount && previousPasswordHash) {
        await prisma.account.update({
          where: { id: credentialAccount.id },
          data: { password: previousPasswordHash },
        });
      } else if (!credentialAccount) {
        await prisma.account.deleteMany({
          where: { userId: mentor.id, providerId: "credential" },
        });
      }
      await prisma.user.update({
        where: { id: mentor.id },
        data: { mustChangePassword: previousMustChangePassword },
      });
    } catch (cleanupError: any) {
      console.error(
        "Critical Error: Failed to roll back password reset after email delivery error:",
        cleanupError.message || cleanupError,
      );
    }

    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to deliver password reset email. Password change has been rolled back.",
    );
  }

  // 7. Revoke active sessions upon successful email delivery
  await prisma.session.deleteMany({
    where: { userId: mentor.id },
  });

  return {
    id: mentor.id,
    name: mentor.name,
    email: mentor.email,
    role: mentor.role || "MENTOR",
    mustChangePassword: true,
  };
};

export const AdminMentorService = {
  createMentor,
  listMentors,
  getMentorById,
  updateMentor,
  resetMentorPassword,
};
