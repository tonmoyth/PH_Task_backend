import nodemailer from "nodemailer";
import { envVeriables } from "../config/envConfig";

export interface ISendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface IMentorEmailPayload {
  name: string;
  email: string;
  temporaryPassword: string;
}

/**
 * Escapes user-supplied text to prevent HTML injection in emails.
 */
export const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

// Create the nodemailer transporter using configured environment variables
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: envVeriables.EMAIL_USER,
    pass: envVeriables.EMAIL_PASS,
  },
});

/**
 * Low-level email sender.
 */
const sendMail = async (options: ISendEmailOptions): Promise<void> => {
  const fromAddress = envVeriables.EMAIL_FROM || envVeriables.EMAIL_USER;
  await transporter.sendMail({
    from: `"PH_TASK Admin Team" <${fromAddress}>`,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });
};

/**
 * Sends welcome email with temporary credentials to newly created mentor.
 */
const sendMentorCredentialsEmail = async (
  payload: IMentorEmailPayload,
): Promise<void> => {
  const safeName = escapeHtml(payload.name);
  const safeEmail = escapeHtml(payload.email);
  const safePassword = escapeHtml(payload.temporaryPassword);
  const loginUrl = envVeriables.FRONTEND_URL || "http://localhost:3000";

  const subject = "Your Mentor Account Has Been Created";

  const text = `Hello ${payload.name},

Your Mentor account has been created successfully by the administrator.

Login Email: ${payload.email}
Temporary Password: ${payload.temporaryPassword}

Please log in at ${loginUrl} using these credentials. You will be required to change your password after your first login.

Regards,
Admin Team`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
      <h2 style="color: #1e293b; margin-top: 0; font-size: 22px;">Your Mentor Account Has Been Created</h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.6;">Hello <strong>${safeName}</strong>,</p>
      <p style="color: #475569; font-size: 15px; line-height: 1.6;">Your Mentor account has been created successfully by the administrator. Please use the temporary credentials below to access your dashboard:</p>
      
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #334155;"><strong>Login Email:</strong> <code style="background-color: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-family: monospace;">${safeEmail}</code></p>
        <p style="margin: 0; font-size: 14px; color: #334155;"><strong>Temporary Password:</strong> <code style="background-color: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-weight: bold; color: #0f172a;">${safePassword}</code></p>
      </div>

      <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
          <strong>Security Notice:</strong> You are required to change your temporary password immediately upon your first login.
        </p>
      </div>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${loginUrl}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; display: inline-block;">Log In to Dashboard</a>
      </div>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 13px; margin: 0;">Regards,<br />Admin Team</p>
    </div>
  `;

  await emailService.sendMail({
    to: payload.email,
    subject,
    text,
    html,
  });
};

/**
 * Sends temporary password email when administrator resets a mentor's password.
 */
const sendMentorPasswordResetEmail = async (
  payload: IMentorEmailPayload,
): Promise<void> => {
  const safeName = escapeHtml(payload.name);
  const safeEmail = escapeHtml(payload.email);
  const safePassword = escapeHtml(payload.temporaryPassword);
  const loginUrl = envVeriables.FRONTEND_URL || "http://localhost:3000";

  const subject = "Your Mentor Account Password Has Been Reset";

  const text = `Hello ${payload.name},

Your Mentor account password has been reset by the administrator.

Login Email: ${payload.email}
Temporary Password: ${payload.temporaryPassword}

Please log in at ${loginUrl} using these credentials. You will be required to change your password after logging in.

Regards,
Admin Team`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
      <h2 style="color: #1e293b; margin-top: 0; font-size: 22px;">Your Mentor Password Has Been Reset</h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.6;">Hello <strong>${safeName}</strong>,</p>
      <p style="color: #475569; font-size: 15px; line-height: 1.6;">Your Mentor account password has been reset by the administrator. Please use the temporary credentials below to access your account:</p>
      
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #334155;"><strong>Login Email:</strong> <code style="background-color: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-family: monospace;">${safeEmail}</code></p>
        <p style="margin: 0; font-size: 14px; color: #334155;"><strong>Temporary Password:</strong> <code style="background-color: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-weight: bold; color: #0f172a;">${safePassword}</code></p>
      </div>

      <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
          <strong>Security Notice:</strong> All existing active sessions have been invalidated. You are required to change your temporary password upon logging in.
        </p>
      </div>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${loginUrl}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; display: inline-block;">Log In to Dashboard</a>
      </div>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 13px; margin: 0;">Regards,<br />Admin Team</p>
    </div>
  `;

  await emailService.sendMail({
    to: payload.email,
    subject,
    text,
    html,
  });
};

export const emailService = {
  sendMail,
  sendMentorCredentialsEmail,
  sendMentorPasswordResetEmail,
};
