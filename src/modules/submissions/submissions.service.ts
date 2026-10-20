import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import AppError from "../../errors/AppError";
import { QueryBuilder } from "../../utils/queryBuilder";
import {
  validateAndNormalizeGitHubUrl,
  validateAndNormalizeLiveUrl,
} from "../../utils/url.util";
import { IQueryParams } from "../../interface/queryBuilder.interface";
import { Prisma, Submission } from "../../generated/prisma/client";

export interface ICreateSubmissionPayload {
  projectName: string;
  repoUrl: string;
  liveLink: string;
  description: string;
}

export interface IUpdateSubmissionPayload {
  projectName?: string;
  repoUrl?: string;
  liveLink?: string;
  description?: string;
}

// 1. Create a new submission
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

// 2. Get my submissions with pagination using QueryBuilder
const getMySubmissions = async (
  studentId: string,
  queryParams: IQueryParams,
) => {
  const sanitizedParams: IQueryParams = { ...queryParams };
  if (sanitizedParams.limit) {
    const parsedLimit = Number(sanitizedParams.limit);
    if (!isNaN(parsedLimit) && parsedLimit > 100) {
      sanitizedParams.limit = "100"; // Cap maximum page size to 100
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

// 3. Get my submission details by ID
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

// 4. Edit and resubmit a submission
const updateAndResubmit = async (
  studentId: string,
  submissionId: string,
  payload: IUpdateSubmissionPayload,
) => {
  return await prisma.$transaction(async (tx) => {
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

      const updated = await tx.submission.findUnique({
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

      return updated;
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
};

// 5. Withdraw a pending submission
const withdrawSubmission = async (
  studentId: string,
  submissionId: string,
) => {
  return await prisma.$transaction(async (tx) => {
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
};

export const SubmissionsService = {
  createSubmission,
  getMySubmissions,
  getMySubmissionById,
  updateAndResubmit,
  withdrawSubmission,
};
