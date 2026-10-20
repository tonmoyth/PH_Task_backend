import { z } from "zod";

const signupZodSchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(100, "Name cannot exceed 100 characters"),
    email: z
      .string()
      .trim()
      .email("Invalid email format")
      .max(255, "Email cannot exceed 255 characters"),
    password: z
      .string()
      .min(6, "Password must be at least 6 characters")
      .max(100, "Password cannot exceed 100 characters"),
  }),
});

const loginZodSchema = z.object({
  body: z.object({
    email: z
      .string()
      .trim()
      .email("Invalid email format"),
    password: z
      .string()
      .min(1, "Password is required"),
  }),
});

const changePasswordZodSchema = z.object({
  body: z
    .object({
      oldPassword: z.string().optional(),
      currentPassword: z.string().optional(),
      newPassword: z
        .string()
        .min(6, "New password must be at least 6 characters")
        .max(100, "New password cannot exceed 100 characters"),
    })
    .refine((data) => Boolean(data.oldPassword || data.currentPassword), {
      message: "Current/Old password is required",
      path: ["oldPassword"],
    }),
});

const forgotPasswordZodSchema = z.object({
  body: z.object({
    email: z
      .string()
      .trim()
      .email("Invalid email format"),
  }),
});

const resetPasswordZodSchema = z.object({
  body: z
    .object({
      email: z.string().trim().email("Invalid email format").optional(),
      code: z.string().optional(),
      otp: z.string().optional(),
      token: z.string().optional(),
      newPassword: z
        .string()
        .min(6, "New password must be at least 6 characters")
        .max(100, "New password cannot exceed 100 characters"),
    })
    .refine((data) => Boolean(data.code || data.otp || data.token), {
      message: "Verification code (OTP) is required",
      path: ["code"],
    }),
});

export const AuthValidation = {
  signupZodSchema,
  loginZodSchema,
  changePasswordZodSchema,
  forgotPasswordZodSchema,
  resetPasswordZodSchema,
};
