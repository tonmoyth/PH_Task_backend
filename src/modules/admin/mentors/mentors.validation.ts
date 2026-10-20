import { z } from "zod";

const createMentorZodSchema = z.object({
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(1, "Name cannot be empty")
        .max(100, "Name cannot exceed 100 characters"),
      email: z
        .string()
        .trim()
        .email("Invalid email format")
        .max(255, "Email cannot exceed 255 characters"),
    })
    .strict(),
});

const listMentorsQueryZodSchema = z.object({
  query: z
    .object({
      page: z
        .string()
        .optional()
        .refine(
          (val) => !val || (!isNaN(Number(val)) && Number(val) > 0),
          { message: "Page must be a positive integer" },
        ),
      limit: z
        .string()
        .optional()
        .refine(
          (val) => !val || (!isNaN(Number(val)) && Number(val) > 0),
          { message: "Limit must be a positive integer" },
        ),
      search: z.string().trim().optional(),
      searchTerm: z.string().trim().optional(),
      isActive: z.enum(["true", "false"]).optional(),
      sortBy: z.string().trim().optional(),
      sortOrder: z.enum(["asc", "desc"]).optional(),
    })
    .optional(),
});

const mentorIdParamZodSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Mentor ID is required"),
  }),
});

const updateMentorZodSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Mentor ID is required"),
  }),
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(1, "Name cannot be empty")
        .max(100, "Name cannot exceed 100 characters")
        .optional(),
      isActive: z.boolean().optional(),
    })
    .strict()
    .refine(
      (data) => data.name !== undefined || data.isActive !== undefined,
      {
        message: "At least one field (name or isActive) must be provided for update",
      },
    ),
});

const resetPasswordZodSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Mentor ID is required"),
  }),
  body: z
    .object({})
    .strict()
    .optional(),
});

export const AdminMentorValidation = {
  createMentorZodSchema,
  listMentorsQueryZodSchema,
  mentorIdParamZodSchema,
  updateMentorZodSchema,
  resetPasswordZodSchema,
};
