import { db } from "../db";
import { emailOutbox, users, InsertEmailOutbox, EmailOutbox } from "@shared/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { tenantIntegrationService } from "./tenantIntegrations";
import Mailgun from "mailgun.js";
import FormData from "form-data";

export type EmailMessageType = 
  | "invitation"
  | "mention_notification"
  | "forgot_password"
  | "test_email"
  | "other";

export type EmailStatus = "queued" | "sent" | "failed";

interface SendEmailOptions {
  tenantId: string | null;
  messageType: EmailMessageType;
  toEmail: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

interface EmailLogFilters {
  tenantId?: string;
  status?: EmailStatus;
  messageType?: EmailMessageType;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

interface ResendResult {
  success: boolean;
  message: string;
  newEmailId?: string;
}

const RESENDABLE_MESSAGE_TYPES: EmailMessageType[] = [
  "invitation",
  "forgot_password",
];

function debugLog(message: string, data?: Record<string, unknown>) {
  if (process.env.EMAIL_DEBUG === "true" || process.env.MAILGUN_DEBUG === "true") {
    console.log(`[EmailOutbox] ${message}`, data ? JSON.stringify(data) : "");
  }
}

export class EmailOutboxService {
  async sendEmail(options: SendEmailOptions): Promise<{ success: boolean; emailId: string; error?: string }> {
    const { tenantId, messageType, toEmail, subject, textBody, htmlBody, requestId, metadata } = options;

    const emailId = crypto.randomUUID();

    await db.insert(emailOutbox).values({
      id: emailId,
      tenantId,
      messageType,
      toEmail,
      subject,
      status: "queued",
      requestId: requestId || null,
      metadata: metadata || null,
    });

    debugLog("Email queued", { emailId, tenantId, messageType, toEmail, subject });

    if (!tenantId) {
      await this.updateEmailStatus(emailId, "failed", null, "No tenant ID provided - cannot determine email provider");
      return { success: false, emailId, error: "No tenant ID provided" };
    }

    try {
      const integrationData = await tenantIntegrationService.getIntegrationWithSecrets(tenantId, "mailgun");
      
      if (!integrationData?.publicConfig || !integrationData?.secretConfig) {
        await this.updateEmailStatus(emailId, "failed", null, "Mailgun not configured for tenant");
        return { success: false, emailId, error: "Mailgun not configured" };
      }

      const config = integrationData.publicConfig as { domain: string; fromEmail: string };
      const secrets = integrationData.secretConfig as { apiKey: string };

      if (!secrets.apiKey || !config.domain || !config.fromEmail) {
        await this.updateEmailStatus(emailId, "failed", null, "Mailgun configuration incomplete");
        return { success: false, emailId, error: "Mailgun configuration incomplete" };
      }

      const mailgun = new Mailgun(FormData);
      const mg = mailgun.client({ username: "api", key: secrets.apiKey });

      const messageData: any = {
        from: config.fromEmail,
        to: [toEmail],
        subject,
        text: textBody,
      };

      if (htmlBody) {
        messageData.html = htmlBody;
      }

      const response = await mg.messages.create(config.domain, messageData);

      debugLog("Email sent successfully", { emailId, tenantId, providerMessageId: response.id });

      await this.updateEmailStatus(emailId, "sent", response.id || null, null);

      return { success: true, emailId };
    } catch (error: any) {
      const errorMessage = error.message || "Unknown error sending email";
      debugLog("Email send failed", { emailId, tenantId, error: errorMessage });
      await this.updateEmailStatus(emailId, "failed", null, errorMessage);
      return { success: false, emailId, error: errorMessage };
    }
  }

  private async updateEmailStatus(
    emailId: string,
    status: EmailStatus,
    providerMessageId: string | null,
    lastError: string | null
  ): Promise<void> {
    await db
      .update(emailOutbox)
      .set({
        status,
        providerMessageId,
        lastError,
        updatedAt: new Date(),
      })
      .where(eq(emailOutbox.id, emailId));
  }

  async getEmailLogs(filters: EmailLogFilters): Promise<{ emails: EmailOutbox[]; total: number }> {
    const conditions = [];

    if (filters.tenantId) {
      conditions.push(eq(emailOutbox.tenantId, filters.tenantId));
    }
    if (filters.status) {
      conditions.push(eq(emailOutbox.status, filters.status));
    }
    if (filters.messageType) {
      conditions.push(eq(emailOutbox.messageType, filters.messageType));
    }
    if (filters.fromDate) {
      conditions.push(gte(emailOutbox.createdAt, filters.fromDate));
    }
    if (filters.toDate) {
      conditions.push(lte(emailOutbox.createdAt, filters.toDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailOutbox)
      .where(whereClause);

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const emails = await db
      .select()
      .from(emailOutbox)
      .where(whereClause)
      .orderBy(desc(emailOutbox.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      emails,
      total: Number(countResult?.count || 0),
    };
  }

  async getEmailById(emailId: string): Promise<EmailOutbox | null> {
    const [email] = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.id, emailId))
      .limit(1);
    return email || null;
  }

  async canResend(email: EmailOutbox, tenantId: string | null): Promise<{ allowed: boolean; reason?: string }> {
    if (!RESENDABLE_MESSAGE_TYPES.includes(email.messageType as EmailMessageType)) {
      return { allowed: false, reason: `Message type '${email.messageType}' cannot be resent` };
    }

    if (email.status !== "failed") {
      return { allowed: false, reason: "Only failed emails can be resent" };
    }

    if (tenantId && email.tenantId !== tenantId) {
      return { allowed: false, reason: "Email belongs to a different tenant" };
    }

    const MAX_RESENDS = 3;
    if ((email.resendCount || 0) >= MAX_RESENDS) {
      return { allowed: false, reason: `Maximum resend attempts (${MAX_RESENDS}) reached` };
    }

    return { allowed: true };
  }

  async resendEmail(emailId: string, tenantId: string | null, requestId: string): Promise<ResendResult> {
    const email = await this.getEmailById(emailId);
    if (!email) {
      return { success: false, message: "Email not found" };
    }

    const canResendResult = await this.canResend(email, tenantId);
    if (!canResendResult.allowed) {
      return { success: false, message: canResendResult.reason || "Cannot resend" };
    }

    await db
      .update(emailOutbox)
      .set({
        resendCount: (email.resendCount || 0) + 1,
        lastResendAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(emailOutbox.id, emailId));

    const result = await this.sendEmail({
      tenantId: email.tenantId,
      messageType: email.messageType as EmailMessageType,
      toEmail: email.toEmail,
      subject: email.subject,
      textBody: (email.metadata as any)?.originalTextBody || `[Resend] Original email ID: ${emailId}`,
      requestId,
      metadata: {
        ...(email.metadata as object || {}),
        resendOf: emailId,
        resendCount: (email.resendCount || 0) + 1,
      },
    });

    if (result.success) {
      return { 
        success: true, 
        message: "Email resent successfully",
        newEmailId: result.emailId,
      };
    }

    return { 
      success: false, 
      message: result.error || "Failed to resend email",
    };
  }

  async validateRecipientBelongsToTenant(email: string, tenantId: string): Promise<boolean> {
    const [user] = await db
      .select()
      .from(users)
      .where(and(
        eq(users.email, email),
        eq(users.tenantId, tenantId)
      ))
      .limit(1);
    return !!user;
  }

  async getEmailStats(tenantId?: string): Promise<{
    total: number;
    sent: number;
    failed: number;
    queued: number;
    last24Hours: number;
    last7Days: number;
  }> {
    const conditions = tenantId ? [eq(emailOutbox.tenantId, tenantId)] : [];
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [stats] = await db
      .select({
        total: sql<number>`count(*)`,
        sent: sql<number>`count(*) filter (where status = 'sent')`,
        failed: sql<number>`count(*) filter (where status = 'failed')`,
        queued: sql<number>`count(*) filter (where status = 'queued')`,
      })
      .from(emailOutbox)
      .where(whereClause);

    const [recent24h] = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailOutbox)
      .where(and(
        ...conditions,
        gte(emailOutbox.createdAt, last24Hours)
      ));

    const [recent7d] = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailOutbox)
      .where(and(
        ...conditions,
        gte(emailOutbox.createdAt, last7Days)
      ));

    return {
      total: Number(stats?.total || 0),
      sent: Number(stats?.sent || 0),
      failed: Number(stats?.failed || 0),
      queued: Number(stats?.queued || 0),
      last24Hours: Number(recent24h?.count || 0),
      last7Days: Number(recent7d?.count || 0),
    };
  }
}

export const emailOutboxService = new EmailOutboxService();
