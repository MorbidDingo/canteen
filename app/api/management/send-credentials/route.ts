import { NextRequest, NextResponse } from "next/server";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import nodemailer from "nodemailer";
import { runParallelForEach } from "@/lib/bulk-upload-engine";

const DEFAULT_GMAIL_CONCURRENCY = 3;
const DEFAULT_SMTP_CONCURRENCY = 6;

// POST — send login credentials to parents
export async function POST(request: NextRequest) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (access.deviceLoginProfile) {
    return NextResponse.json(
      { error: "Credential dispatch controls are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
      { status: 403 },
    );
  }

  const transporter =
    process.env.SMTP_USER && process.env.SMTP_PASS
      ? nodemailer.createTransport({
          pool: true,
          maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS || 6),
          maxMessages: Number(process.env.SMTP_MAX_MESSAGES || 100),
          rateDelta: Number(process.env.SMTP_RATE_DELTA_MS || 1000),
          rateLimit: Number(process.env.SMTP_RATE_LIMIT || 20),
          host: process.env.SMTP_HOST || "smtp.gmail.com",
          port: Number(process.env.SMTP_PORT || 587),
          secure: process.env.SMTP_SECURE === "true",
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        })
      : null;

  if (!transporter) {
    return NextResponse.json(
      { error: "SMTP not configured. Cannot send emails." },
      { status: 503 },
    );
  }

  try {
    const body = await request.json();
    const { credentials } = body as {
      credentials: { email: string; password: string; parentName: string }[];
    };

    if (!credentials?.length) {
      return NextResponse.json({ error: "No credentials to send" }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const results: { email: string; success: boolean; error?: string }[] = new Array(credentials.length);
    const host = (process.env.SMTP_HOST || "smtp.gmail.com").toLowerCase();
    const isGmailHost = host.includes("gmail");
    const sendConcurrency = Math.max(
      1,
      Number(process.env.BULK_EMAIL_CONCURRENCY || (isGmailHost ? DEFAULT_GMAIL_CONCURRENCY : DEFAULT_SMTP_CONCURRENCY)),
    );

    await runParallelForEach(credentials, sendConcurrency, async (cred, index) => {
      try {
        await transporter.sendMail({
          from:
            process.env.SMTP_FROM ||
            process.env.SMTP_USER ||
            "noreply@certe.app",
          to: cred.email,
          subject: "Your certe Parent Account Credentials",
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #d4891a;">Welcome to certe!</h2>
              <p>Hi ${cred.parentName},</p>
              <p>A parent account has been created for you. Use the credentials below to log in:</p>
              <div style="background: #f4f4f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <p style="margin: 4px 0;"><strong>Email:</strong> ${cred.email}</p>
                <p style="margin: 4px 0;"><strong>Password:</strong> ${cred.password}</p>
              </div>
              <a href="${appUrl}/login" style="display: inline-block; background: #d4891a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
                Log In Now
              </a>
              <p style="color: #666; font-size: 14px;">Please change your password after logging in for the first time.</p>
            </div>
          `,
        });
        results[index] = { email: cred.email, success: true };
      } catch (err) {
        console.error(`Failed to send credentials to ${cred.email}:`, err);
        results[index] = {
          email: cred.email,
          success: false,
          error: err instanceof Error ? err.message : "Send failed",
        };
      }
    });

    const sent = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({ sent, failed, concurrency: sendConcurrency, providerHost: host, results });
  } catch (error) {
    console.error("Send credentials error:", error);
    return NextResponse.json({ error: "Failed to send credentials" }, { status: 500 });
  }
}
