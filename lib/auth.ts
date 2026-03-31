import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as schema from "./db/schema";
import { session as sessionTable, user as userTable } from "./db/schema";
import { eq, and, gt, count } from "drizzle-orm";
import nodemailer from "nodemailer";

// ─── Device / Session Limits Per Role ────────────────────
// Management, Device, Operator: max 1 concurrent session
// Parent, General: max 2 concurrent sessions
// Owner, Admin, Platform roles: unlimited

const SINGLE_SESSION_ROLES = new Set([
  "MANAGEMENT", "DEVICE", "OPERATOR", "LIB_OPERATOR", "ATTENDANCE",
]);
const DUAL_SESSION_ROLES = new Set(["PARENT", "GENERAL"]);

function getMaxSessions(role: string | null): number | null {
  if (!role) return null;
  if (SINGLE_SESSION_ROLES.has(role)) return 1;
  if (DUAL_SESSION_ROLES.has(role)) return 2;
  return null; // unlimited for OWNER, ADMIN, PLATFORM_*
}

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
          <h2 style="color: #d4891a;">certe — Password Reset</h2>
          <p>Hi ${user.name},</p>
          <p>We received a request to reset your password. Click the button below to set a new password:</p>
          <a href="${url}" style="display: inline-block; background: #d4891a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
            Reset Password
          </a>
          <p style="color: #666; font-size: 14px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
        </div>
      `;

      if (transporter) {
        try {
          await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@certe.app",
            to: user.email,
            subject: "Reset your certe password",
            html,
          });
        } catch (err) {
          console.error("[Password Reset] Failed to send email:", err);
          // Don't rethrow — let better-auth return success to prevent email enumeration
        }
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

  databaseHooks: {
    session: {
      create: {
        before: async (sessionData) => {
          try {
            const userId = sessionData.userId;
            // Look up the user's role
            const [userRow] = await db
              .select({ role: userTable.role })
              .from(userTable)
              .where(eq(userTable.id, userId))
              .limit(1);

            const maxSessions = getMaxSessions(userRow?.role ?? null);
            if (maxSessions === null) return; // unlimited — allow

            // Count active (non-expired) sessions for this user
            const now = new Date();
            const [result] = await db
              .select({ total: count() })
              .from(sessionTable)
              .where(
                and(
                  eq(sessionTable.userId, userId),
                  gt(sessionTable.expiresAt, now),
                ),
              );

            const activeCount = result?.total ?? 0;
            if (activeCount >= maxSessions) {
              return false; // reject session creation — device limit reached
            }
          } catch (e) {
            console.error("[Session Hook] Error checking session limit:", e);
            // Allow on error to avoid locking users out
          }
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
