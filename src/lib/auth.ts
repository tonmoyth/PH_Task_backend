import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, emailOTP } from "better-auth/plugins";
import nodemailer from "nodemailer";

import { prisma } from "./prisma";
import { envVeriables } from "../config/envConfig";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: envVeriables.EMAIL_USER,
    pass: envVeriables.EMAIL_PASS,
  },
});

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  baseURL: envVeriables.BETTER_AUTH_URL,
  secret: envVeriables.BETTER_AUTH_SECRET,

  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "STUDENT",
      },
      mustChangePassword: {
        type: "boolean",
        required: false,
        defaultValue: false,
      },
      createdById: {
        type: "string",
        required: false,
      },
      isActive: {
        type: "boolean",
        required: false,
        defaultValue: true,
      },
    },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },

  plugins: [
    admin({
      defaultRole: "STUDENT",
    }),
    emailOTP({
      expiresIn: 10 * 60, // 10 minutes
      otpLength: 6,
      sendVerificationOnSignUp: false,
      overrideDefaultEmailVerification: false,
      async sendVerificationOTP({ email, otp, type }) {
        const subject =
          type === "forget-password"
            ? "Your Password Reset Code"
            : "Verification Code";
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2 style="color: #333;">Password Reset Code</h2>
            <p style="color: #555;">You requested to reset your password. Use the verification code below:</p>
            <div style="background-color: #f4f4f9; padding: 15px; text-align: center; border-radius: 6px; margin: 20px 0;">
              <span style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #4F46E5;">${otp}</span>
            </div>
            <p style="color: #777; font-size: 14px;">This code is valid for 10 minutes. If you did not request this code, please ignore this email.</p>
          </div>
        `;

        try {
          await transporter.sendMail({
            from: `"PH_TASK" <${envVeriables.EMAIL_FROM || envVeriables.EMAIL_USER}>`,
            to: email,
            subject,
            html,
          });
        } catch (error) {
          console.error("Failed to send OTP email:", error);
        }
      },
    }),
  ],
});
