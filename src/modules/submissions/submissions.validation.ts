import { z } from "zod";
import {
  validateAndNormalizeGitHubUrl,
  validateAndNormalizeLiveUrl,
} from "../../utils/url.util";

const forbiddenPrivilegedKeys = [
  "status",
  "studentId",
  "reviewedById",
  "approvedAt",
  "rejectedAt",
  "resubmitCount",
  "createdAt",
  "updatedAt",
  "reviewedAt",
];

const createSubmissionZodSchema = z.object({
  body: z
    .object({
      projectName: z
        .string()
        .trim()
        .min(2, "Project name must be at least 2 characters")
        .max(100, "Project name cannot exceed 100 characters"),
      repoUrl: z
        .string()
        .trim()
        .min(1, "Repository URL is required")
        .max(500, "Repository URL is too long")
        .refine(
          (val) => validateAndNormalizeGitHubUrl(val).isValid,
          {
            message: "Invalid GitHub repository URL (must be in format: https://github.com/owner/repo)",
          },
        ),
      liveLink: z
        .string()
        .trim()
        .min(1, "Live link URL is required")
        .max(500, "Live link URL is too long")
        .refine(
          (val) => validateAndNormalizeLiveUrl(val).isValid,
          {
            message: "Invalid live link URL (must use http:// or https://)",
          },
        ),
      description: z
        .string()
        .trim()
        .min(10, "Description must be at least 10 characters")
        .max(2000, "Description cannot exceed 2000 characters"),
    })
    .strict()
    .superRefine((data, ctx) => {
      const keys = Object.keys(data);
      for (const forbidden of forbiddenPrivilegedKeys) {
        if (keys.includes(forbidden)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Field "${forbidden}" is not allowed to be modified by the client`,
            path: [forbidden],
          });
        }
      }
    }),
});

const updateSubmissionZodSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Submission ID is required"),
  }),
  body: z
    .object({
      projectName: z
        .string()
        .trim()
        .min(2, "Project name must be at least 2 characters")
        .max(100, "Project name cannot exceed 100 characters")
        .optional(),
      repoUrl: z
        .string()
        .trim()
        .min(1, "Repository URL cannot be empty")
        .max(500, "Repository URL is too long")
        .refine(
          (val) => validateAndNormalizeGitHubUrl(val).isValid,
          {
            message: "Invalid GitHub repository URL (must be in format: https://github.com/owner/repo)",
          },
        )
        .optional(),
      liveLink: z
        .string()
        .trim()
        .min(1, "Live link URL cannot be empty")
        .max(500, "Live link URL is too long")
        .refine(
          (val) => validateAndNormalizeLiveUrl(val).isValid,
          {
            message: "Invalid live link URL (must use http:// or https://)",
          },
        )
        .optional(),
      description: z
        .string()
        .trim()
        .min(10, "Description must be at least 10 characters")
        .max(2000, "Description cannot exceed 2000 characters")
        .optional(),
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one update field must be provided",
    })
    .superRefine((data, ctx) => {
      const keys = Object.keys(data);
      for (const forbidden of forbiddenPrivilegedKeys) {
        if (keys.includes(forbidden)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Field "${forbidden}" cannot be updated by student`,
            path: [forbidden],
          });
        }
      }
    }),
});

const submissionIdParamZodSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Submission ID is required"),
  }),
});

const getMySubmissionsQueryZodSchema = z.object({
  query: z
    .object({
      page: z
        .string()
        .regex(/^\d+$/, "Page must be a positive integer")
        .optional(),
      limit: z
        .string()
        .regex(/^\d+$/, "Limit must be a positive integer")
        .optional(),
      sortBy: z.string().optional(),
      sortOrder: z.enum(["asc", "desc"]).optional(),
      status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
      searchTerm: z.string().optional(),
    })
    .optional(),
});

export const SubmissionsValidation = {
  createSubmissionZodSchema,
  updateSubmissionZodSchema,
  submissionIdParamZodSchema,
  getMySubmissionsQueryZodSchema,
};
