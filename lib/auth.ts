import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as schema from "./db/schema";
import nodemailer from "nodemailer";

const transporter = process.env.SMTP_USER && process.env.SMTP_PASS
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
    },
  }),

  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      const html = `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1a3a8f;">Venus Café — Password Reset</h2>
          <p>Hi ${user.name},</p>
          <p>We received a request to reset your password. Click the button below to set a new password:</p>
          <a href="${url}" style="display: inline-block; background: #1a3a8f; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
            Reset Password
          </a>
          <p style="color: #666; font-size: 14px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
        </div>
      `;

      if (transporter) {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@venuscafe.com",
          to: user.email,
          subject: "Reset your Venus Café password",
          html,
        });
      } else {
        console.log("\n╔══════════════════════════════════════════════════╗");
        console.log("║        PASSWORD RESET (SMTP not configured)      ║");
        console.log("╠══════════════════════════════════════════════════╣");
        console.log(`║ User: ${user.email}`);
        console.log(`║ URL:  ${url}`);
        console.log("╚══════════════════════════════════════════════════╝\n");
      }
    },
  },

  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "PARENT",
        input: false, // role is set server-side, not by the user during signup
      },
      phone: {
        type: "string",
        required: false,
      },
      childName: {
        type: "string",
        required: false,
      },
      childGrNumber: {
        type: "string",
        required: false,
      },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
});

export type Session = typeof auth.$Infer.Session;
