import { db } from "../db";
import { emailTemplates, type EmailTemplate } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { DEFAULT_TEMPLATES, getDefaultTemplate, type DefaultTemplate, type TemplateVariable } from "./emailTemplateDefaults";

export interface RenderedEmail {
  subject: string;
  htmlBody: string;
  textBody: string;
}

function renderString(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match;
  });
}

export class EmailTemplateService {
  async getTemplate(tenantId: string | null, templateKey: string): Promise<EmailTemplate | null> {
    if (tenantId) {
      const [tenantTemplate] = await db.select()
        .from(emailTemplates)
        .where(and(
          eq(emailTemplates.tenantId, tenantId),
          eq(emailTemplates.templateKey, templateKey),
          eq(emailTemplates.isActive, true),
        ))
        .limit(1);

      if (tenantTemplate) return tenantTemplate;
    }

    const [systemTemplate] = await db.select()
      .from(emailTemplates)
      .where(and(
        isNull(emailTemplates.tenantId),
        eq(emailTemplates.templateKey, templateKey),
        eq(emailTemplates.isActive, true),
      ))
      .limit(1);

    return systemTemplate || null;
  }

  renderTemplate(template: { subject: string; htmlBody: string; textBody: string }, variables: Record<string, string>): RenderedEmail {
    return {
      subject: renderString(template.subject, variables),
      htmlBody: renderString(template.htmlBody, variables),
      textBody: renderString(template.textBody, variables),
    };
  }

  async renderByKey(tenantId: string | null, templateKey: string, variables: Record<string, string>): Promise<RenderedEmail | null> {
    const template = await this.getTemplate(tenantId, templateKey);
    if (template) {
      return this.renderTemplate(template, variables);
    }

    const defaultTemplate = getDefaultTemplate(templateKey);
    if (defaultTemplate) {
      return this.renderTemplate(defaultTemplate, variables);
    }

    return null;
  }

  async listTemplates(tenantId: string | null): Promise<EmailTemplate[]> {
    if (tenantId === null) {
      return db.select()
        .from(emailTemplates)
        .where(isNull(emailTemplates.tenantId))
        .orderBy(emailTemplates.templateKey);
    }

    return db.select()
      .from(emailTemplates)
      .where(eq(emailTemplates.tenantId, tenantId))
      .orderBy(emailTemplates.templateKey);
  }

  async upsertTemplate(data: {
    tenantId: string | null;
    templateKey: string;
    name: string;
    subject: string;
    htmlBody: string;
    textBody: string;
    variables?: TemplateVariable[];
    userId?: string;
  }): Promise<EmailTemplate> {
    const whereCondition = data.tenantId
      ? and(eq(emailTemplates.tenantId, data.tenantId), eq(emailTemplates.templateKey, data.templateKey))
      : and(isNull(emailTemplates.tenantId), eq(emailTemplates.templateKey, data.templateKey));

    const [existing] = await db.select()
      .from(emailTemplates)
      .where(whereCondition)
      .limit(1);

    if (existing) {
      const [updated] = await db.update(emailTemplates)
        .set({
          name: data.name,
          subject: data.subject,
          htmlBody: data.htmlBody,
          textBody: data.textBody,
          variables: data.variables || existing.variables,
          updatedByUserId: data.userId || null,
          updatedAt: new Date(),
        })
        .where(eq(emailTemplates.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(emailTemplates)
      .values({
        tenantId: data.tenantId,
        templateKey: data.templateKey,
        name: data.name,
        subject: data.subject,
        htmlBody: data.htmlBody,
        textBody: data.textBody,
        variables: data.variables || [],
        createdByUserId: data.userId || null,
        updatedByUserId: data.userId || null,
      })
      .returning();
    return created;
  }

  async deleteTemplate(id: string): Promise<void> {
    await db.delete(emailTemplates).where(eq(emailTemplates.id, id));
  }

  async resetToDefault(tenantId: string | null, templateKey: string): Promise<EmailTemplate | null> {
    const whereCondition = tenantId
      ? and(eq(emailTemplates.tenantId, tenantId), eq(emailTemplates.templateKey, templateKey))
      : and(isNull(emailTemplates.tenantId), eq(emailTemplates.templateKey, templateKey));

    await db.delete(emailTemplates).where(whereCondition);

    const defaultTemplate = getDefaultTemplate(templateKey);
    if (!defaultTemplate) return null;

    const [created] = await db.insert(emailTemplates)
      .values({
        tenantId,
        templateKey: defaultTemplate.templateKey,
        name: defaultTemplate.name,
        subject: defaultTemplate.subject,
        htmlBody: defaultTemplate.htmlBody,
        textBody: defaultTemplate.textBody,
        variables: defaultTemplate.variables,
      })
      .returning();
    return created;
  }

  getAvailableVariables(templateKey: string): TemplateVariable[] {
    const defaultTemplate = getDefaultTemplate(templateKey);
    return defaultTemplate?.variables || [];
  }

  async seedDefaults(): Promise<void> {
    for (const tmpl of DEFAULT_TEMPLATES) {
      const [existing] = await db.select({ id: emailTemplates.id })
        .from(emailTemplates)
        .where(and(
          isNull(emailTemplates.tenantId),
          eq(emailTemplates.templateKey, tmpl.templateKey),
        ))
        .limit(1);

      if (!existing) {
        await db.insert(emailTemplates).values({
          tenantId: null,
          templateKey: tmpl.templateKey,
          name: tmpl.name,
          subject: tmpl.subject,
          htmlBody: tmpl.htmlBody,
          textBody: tmpl.textBody,
          variables: tmpl.variables,
        });
        console.log(`[email-templates] Seeded default template: ${tmpl.templateKey}`);
      }
    }
  }
}

export const emailTemplateService = new EmailTemplateService();
