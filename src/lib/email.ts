import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

/**
 * Email adapter.
 *
 * `console` is the default: messages are written to data/outbox.log and, in
 * development, the verification/reset link is returned to the caller so the
 * journey is testable without an SMTP account. `smtp` is a documented seam and
 * throws until a transport is configured — see docs/DEPLOYMENT.md.
 */
export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  actionUrl?: string;
};

export type EmailResult = { delivered: boolean; previewUrl?: string; provider: string };

export interface EmailAdapter {
  send(message: OutboundEmail): Promise<EmailResult>;
}

class ConsoleEmailAdapter implements EmailAdapter {
  async send(message: OutboundEmail): Promise<EmailResult> {
    const entry = [
      "=".repeat(78),
      `at:      ${new Date().toISOString()}`,
      `to:      ${message.to}`,
      `from:    ${env.emailFrom}`,
      `subject: ${message.subject}`,
      message.actionUrl ? `link:    ${message.actionUrl}` : "",
      "",
      message.text,
      "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const file = path.resolve(process.cwd(), "data", "outbox.log");
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.appendFile(file, `${entry}\n`);
    } catch {
      // Logging outbox failures must never break a signup.
    }
    if (!env.isProduction) console.info(`[email] ${message.subject} -> ${message.to}`);
    return { delivered: true, provider: "console", previewUrl: message.actionUrl };
  }
}

class SmtpEmailAdapter implements EmailAdapter {
  async send(): Promise<EmailResult> {
    throw new Error(
      "SMTP email is not configured in this build. Set EMAIL_PROVIDER=console, or add an SMTP transport in src/lib/email.ts.",
    );
  }
}

export function emailAdapter(): EmailAdapter {
  return env.emailProvider === "smtp" ? new SmtpEmailAdapter() : new ConsoleEmailAdapter();
}

export async function sendVerificationEmail(to: string, token: string): Promise<EmailResult> {
  const url = `${env.appUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
  return emailAdapter().send({
    to,
    subject: "Verify your BuildTogether email",
    text: `Welcome to BuildTogether. Verify your email address to publish projects and learning content:\n\n${url}\n\nThis link expires in 24 hours. If you did not create an account you can ignore this message.`,
    actionUrl: url,
  });
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<EmailResult> {
  const url = `${env.appUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;
  return emailAdapter().send({
    to,
    subject: "Reset your BuildTogether password",
    text: `Someone requested a password reset for your BuildTogether account:\n\n${url}\n\nThis link expires in 1 hour. If this was not you, no action is required.`,
    actionUrl: url,
  });
}

export async function sendNotificationEmail(to: string, subject: string, body: string, href?: string): Promise<void> {
  await emailAdapter().send({
    to,
    subject,
    text: href ? `${body}\n\n${env.appUrl}${href}` : body,
    actionUrl: href ? `${env.appUrl}${href}` : undefined,
  });
}
