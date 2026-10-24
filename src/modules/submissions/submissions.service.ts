import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import AppError from "../../errors/AppError";
import { QueryBuilder } from "../../utils/queryBuilder";
import { getCached, invalidateCache } from "../../utils/cache.util";
import {
  validateAndNormalizeGitHubUrl,
  validateAndNormalizeLiveUrl,
} from "../../utils/url.util";
import { IQueryParams } from "../../interface/queryBuilder.interface";
import { Prisma, Submission } from "../../generated/prisma/client";
import {
  ICreateSubmissionPayload,
  IUpdateSubmissionPayload,
  IReviewSubmissionPayload,
  ISubmissionStats,
} from "./submissions.interface";
import {
  SUBMISSIONS_STATS_CACHE_KEY,
  submissionSearchableFields,
  submissionFilterableFields,
  MAX_PAGE_LIMIT,
  STATS_CACHE_TTL_SECONDS,
} from "./submissions.constant";

// 1. Create a new submission (Student)
const createSubmission = async (
  studentId: string,
  payload: ICreateSubmissionPayload,
) => {
  const repoResult = validateAndNormalizeGitHubUrl(payload.repoUrl);
  if (!repoResult.isValid) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      repoResult.error || "Invalid GitHub repository URL",
    );
  }

  const liveResult = validateAndNormalizeLiveUrl(payload.liveLink);
  if (!liveResult.isValid) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      liveResult.error || "Invalid live link URL",
    );
  }

  // Preliminary duplicate check per student
  const existing = await prisma.submission.findUnique({
    where: {
      studentId_repoUrlNormalized: {
        studentId,
        repoUrlNormalized: repoResult.normalizedUrl,
      },
    },
  });

  if (existing) {
    throw new AppError(
      httpStatus.CONFLICT,
      "You have already submitted this repository",
    );
  }

  try {
    const submission = await prisma.submission.create({
      data: {
        projectName: payload.projectName.trim(),
        repoUrl: payload.repoUrl.trim(),
        repoUrlNormalized: repoResult.normalizedUrl,
        liveUrl: liveResult.normalizedUrl,
        description: payload.description.trim(),
        status: "PENDING",
        resubmitCount: 0,
        studentId,
      },
      select: {
        id: true,
        projectName: true,
        repoUrl: true,
        liveUrl: true,
        description: true,
        status: true,
        rejectionReason: true,
        resubmitCount: true,
        createdAt: true,
        updatedAt: true,
        studentId: true,
      },
    });

    // Invalidate stats cache on submission creation
    await invalidateCache(SUBMISSIONS_STATS_CACHE_KEY);

    return submission;
  } catch (error: any) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AppError(
        httpStatus.CONFLICT,
        "You have already submitted this repository",
      );
    }
    throw error;
  }
};

// 2. Get my submissions with pagination using QueryBuilder (Student)
const getMySubmissions = async (
  studentId: string,
  queryParams: IQueryParams,
) => {
  const sanitizedParams: IQueryParams = { ...queryParams };
  if (sanitizedParams.limit) {
    const parsedLimit = Number(sanitizedParams.limit);
    if (!isNaN(parsedLimit) && parsedLimit > MAX_PAGE_LIMIT) {
      sanitizedParams.limit = String(MAX_PAGE_LIMIT);
    }
  }

  const queryBuilder = new QueryBuilder<Submission>(
    prisma.submission,
    sanitizedParams,
    {
      searchableFields: ["projectName", "description", "repoUrl"],
      filterableFields: ["status"],
    },
  )
    .where({ studentId })
    .search()
    .filter()
    .sort()
    .paginate();

  const result = await queryBuilder.execute();
  return result;
};

// 3. Get my submission details by ID (Student)
const getMySubmissionById = async (
  studentId: string,
  submissionId: string,
) => {
  const submission = await prisma.submission.findFirst({
    where: {
      id: submissionId,
      studentId,
    },
    select: {
      id: true,
      projectName: true,
      repoUrl: true,
      liveUrl: true,
      description: true,
      status: true,
      rejectionReason: true,
      resubmitCount: true,
      reviewedAt: true,
      createdAt: true,
      updatedAt: true,
      studentId: true,
      reviewLogs: {
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          reason: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!submission) {
    throw new AppError(httpStatus.NOT_FOUND, "Submission not found");
  }

  return submission;
};

// 4. Edit and resubmit a submission (Student)
const updateAndResubmit = async (
  studentId: string,
  submissionId: string,
  payload: IUpdateSubmissionPayload,
) => {
  const updated = await prisma.$transaction(async (tx) => {
    // Verify ownership
    const submission = await tx.submission.findFirst({
      where: {
        id: submissionId,
        studentId,
      },
    });

    if (!submission) {
      throw new AppError(httpStatus.NOT_FOUND, "Submission not found");
    }

    // Eligibility check
    if (submission.status !== "PENDING" && submission.status !== "REJECTED") {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Cannot edit or resubmit a submission with status: ${submission.status}. Only PENDING or REJECTED submissions can be edited.`,
      );
    }

    // Prepare update data
    const updateData: Prisma.SubmissionUncheckedUpdateManyInput = {
      status: "PENDING",
      resubmitCount: { increment: 1 },
      rejectionReason: null,
      reviewedAt: null,
      reviewedById: null,
    };

    if (payload.projectName) {
      updateData.projectName = payload.projectName.trim();
    }

    if (payload.repoUrl) {
      const repoResult = validateAndNormalizeGitHubUrl(payload.repoUrl);
      if (!repoResult.isValid) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          repoResult.error || "Invalid GitHub repository URL",
        );
      }

      // Check collision with other submissions by the same student
      if (repoResult.normalizedUrl !== submission.repoUrlNormalized) {
        const duplicate = await tx.submission.findFirst({
          where: {
            studentId,
            repoUrlNormalized: repoResult.normalizedUrl,
            id: { not: submissionId },
          },
        });

        if (duplicate) {
          throw new AppError(
            httpStatus.CONFLICT,
            "You have already submitted this repository in another submission",
          );
        }
      }

      updateData.repoUrl = payload.repoUrl.trim();
      updateData.repoUrlNormalized = repoResult.normalizedUrl;
    }

    if (payload.liveLink) {
      const liveResult = validateAndNormalizeLiveUrl(payload.liveLink);
      if (!liveResult.isValid) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          liveResult.error || "Invalid live link URL",
        );
      }
      updateData.liveUrl = liveResult.normalizedUrl;
    }

    if (payload.description) {
      updateData.description = payload.description.trim();
    }

    try {
      // Concurrency protection: conditional update ensuring status is still PENDING or REJECTED
      const updateResult = await tx.submission.updateMany({
        where: {
          id: submissionId,
          studentId,
          status: { in: ["PENDING", "REJECTED"] },
        },
        data: updateData,
      });

      if (updateResult.count === 0) {
        throw new AppError(
          httpStatus.CONFLICT,
          "Failed to update submission. The submission status may have been updated concurrently by a reviewer.",
        );
      }

      const res = await tx.submission.findUnique({
        where: { id: submissionId },
        select: {
          id: true,
          projectName: true,
          repoUrl: true,
          liveUrl: true,
          description: true,
          status: true,
          rejectionReason: true,
          resubmitCount: true,
          reviewedAt: true,
          createdAt: true,
          updatedAt: true,
          studentId: true,
        },
      });

      return res;
    } catch (error: any) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new AppError(
          httpStatus.CONFLICT,
          "You have already submitted this repository in another submission",
        );
      }
      throw error;
    }
  });

  // Invalidate stats cache on resubmission
  await invalidateCache(SUBMISSIONS_STATS_CACHE_KEY);

  return updated;
};

// 5. Withdraw a pending submission (Student)
const withdrawSubmission = async (
  studentId: string,
  submissionId: string,
) => {
  await prisma.$transaction(async (tx) => {
    const submission = await tx.submission.findFirst({
      where: {
        id: submissionId,
        studentId,
      },
    });

    if (!submission) {
      throw new AppError(httpStatus.NOT_FOUND, "Submission not found");
    }

    if (submission.status !== "PENDING") {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Cannot withdraw submission with status: ${submission.status}. Only PENDING submissions can be withdrawn.`,
      );
    }

    // Atomic conditional delete preventing race condition
    const deleteResult = await tx.submission.deleteMany({
      where: {
        id: submissionId,
        studentId,
        status: "PENDING",
      },
    });

    if (deleteResult.count === 0) {
      throw new AppError(
        httpStatus.CONFLICT,
        "Failed to withdraw submission. The submission status may have changed concurrently.",
      );
    }

    return null;
  });

  // Invalidate stats cache on withdrawal
  await invalidateCache(SUBMISSIONS_STATS_CACHE_KEY);

  return null;
};

// =========================================================================
// MENTOR / ADMIN DASHBOARD SERVICES
// =========================================================================

/**
 * A. GET /submissions — List all submissions (Mentor / Admin)
 * Uses QueryBuilder to support pagination, filtering by status, searching across
 * projectName, repoUrl, student.name, student.email, and sorting with allowlisted fields.
 */
const getAllSubmissions = async (queryParams: IQueryParams) => {
  const sanitizedParams: IQueryParams = { ...queryParams };

  // Map 'search' query param to 'searchTerm' for QueryBuilder compatibility
  if (sanitizedParams.search && !sanitizedParams.searchTerm) {
    sanitizedParams.searchTerm = String(sanitizedParams.search).trim();
  }

  // Map 'sort' to 'sortBy'
  if (sanitizedParams.sort && !sanitizedParams.sortBy) {
    sanitizedParams.sortBy = String(sanitizedParams.sort).trim();
  }

  // Map 'order' to 'sortOrder'
  if (sanitizedParams.order && !sanitizedParams.sortOrder) {
    sanitizedParams.sortOrder =
      String(sanitizedParams.order).toLowerCase() === "asc" ? "asc" : "desc";
  }

  // Enforce maximum page size limit
  if (sanitizedParams.limit) {
    const parsedLimit = Number(sanitizedParams.limit);
    if (!isNaN(parsedLimit) && parsedLimit > MAX_PAGE_LIMIT) {
      sanitizedParams.limit = String(MAX_PAGE_LIMIT);
    }
  }

  const queryBuilder = new QueryBuilder<Submission>(
    prisma.submission,
    sanitizedParams,
    {
      searchableFields: submissionSearchableFields,
      filterableFields: submissionFilterableFields,
    },
  )
    .search()
    .filter()
    .sort()
    .paginate()
    .include({
      student: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      reviewedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    });

  const result = await queryBuilder.execute();
  return result;
};

/**
 * B. GET /submissions/stats — Overall submission statistics (Mentor / Admin)
 * Uses Redis cache-aside caching under stable key 'submissions:stats'.
 * Always returns total, pending, approved, and rejected counts (defaulting missing groups to 0).
 */
const getSubmissionStats = async (): Promise<ISubmissionStats> => {
  return await getCached<ISubmissionStats>(
    SUBMISSIONS_STATS_CACHE_KEY,
    async () => {
      const counts = await prisma.submission.groupBy({
        by: ["status"],
        _count: {
          _all: true,
        },
      });

      let pending = 0;
      let approved = 0;
      let rejected = 0;

      for (const group of counts) {
        if (group.status === "PENDING") {
          pending = group._count._all;
        } else if (group.status === "APPROVED") {
          approved = group._count._all;
        } else if (group.status === "REJECTED") {
          rejected = group._count._all;
        }
      }

      const total = pending + approved + rejected;

      return {
        total,
        pending,
        approved,
        rejected,
      };
    },
    STATS_CACHE_TTL_SECONDS,
  );
};

/**
 * C. GET /submissions/:id — Submission Details (Mentor / Admin)
 * Retrieves single submission including student information, reviewer details,
 * and review history without leaking sensitive authentication secrets.
 */
const getSubmissionById = async (submissionId: string) => {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      reviewedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      reviewLogs: {
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          reason: true,
          createdAt: true,
          reviewer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!submission) {
    throw new AppError(httpStatus.NOT_FOUND, "Submission not found");
  }

  return submission;
};

//__________________________________

const reviewSubmission = async (
  reviewerId: string,
  submissionId: string,
  payload: IReviewSubmissionPayload,
) => {
  const updatedSubmission = await prisma.$transaction(async (tx) => {
    // 1. Verify submission exists and is currently in PENDING state
    const existing = await tx.submission.findUnique({
      where: { id: submissionId },
      select: { id: true, status: true },
    });

    if (!existing) {
      throw new AppError(httpStatus.NOT_FOUND, "Submission not found");
    }

    if (existing.status !== "PENDING") {
      throw new AppError(
        httpStatus.CONFLICT,
        `Submission is already ${existing.status} and cannot be reviewed again`,
      );
    }

    // 2. Concurrency-safe atomic conditional update
    const updateResult = await tx.submission.updateMany({
      where: {
        id: submissionId,
        status: "PENDING",
      },
      data: {
        status: payload.status,
        rejectionReason:
          payload.status === "REJECTED" ? payload.reason!.trim() : null,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
    });

    if (updateResult.count === 0) {
      throw new AppError(
        httpStatus.CONFLICT,
        "Submission has already been reviewed by another reviewer",
      );
    }

    // 3. Create ReviewLog inside the transaction
    await tx.reviewLog.create({
      data: {
        submissionId,
        reviewerId,
        fromStatus: "PENDING",
        toStatus: payload.status,
        reason:
          payload.status === "REJECTED"
            ? payload.reason!.trim()
            : (payload.reason?.trim() || null),
      },
    });

    // 4. Retrieve and return updated submission with safe student & reviewer details
    const submission = await tx.submission.findUnique({
      where: { id: submissionId },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return submission;
  });

  // 5. Invalidate statistics cache strictly after transaction successfully commits
  await invalidateCache(SUBMISSIONS_STATS_CACHE_KEY);

  return updatedSubmission;
};





//______________________________________



/**
 * E. GET /submissions/:id/history — Review History (Mentor / Admin)
 * Returns the chronological review history (newest-first) for a submission.
 * Includes safe reviewer information and returns an empty array if no review logs exist.
 */
const getSubmissionHistory = async (submissionId: string) => {
  // 1. Verify submission exists
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { id: true },
  });

  if (!submission) {
    throw new AppError(httpStatus.NOT_FOUND, "Submission not found");
  }

  // 2. Retrieve review logs with safe reviewer info
  const history = await prisma.reviewLog.findMany({
    where: { submissionId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      reason: true,
      createdAt: true,
      submissionId: true,
      reviewerId: true,
      reviewer: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return history;
};

export const SubmissionsService = {
  createSubmission,
  getMySubmissions,
  getMySubmissionById,
  updateAndResubmit,
  withdrawSubmission,
  getAllSubmissions,
  getSubmissionStats,
  getSubmissionById,
  reviewSubmission,
  getSubmissionHistory,
};
