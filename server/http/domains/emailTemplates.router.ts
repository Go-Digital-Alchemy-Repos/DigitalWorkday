import { Router, Request, Response } from "express";
import { z } from "zod";
import { UserRole } from "@shared/schema";
import { emailTemplateService } from "../../services/emailTemplates";
import { DEFAULT_TEMPLATES, getDefaultTemplate } from "../../services/emailTemplateDefaults";
import { AppError, handleRouteError } from "../../lib/errors";

const router = Router();

function requireSuperUser(req: Request, res: Response, next: () => void) {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    throw AppError.unauthorized("Authentication required");
  }
  const user = req.user as any;
  if (user.role !== UserRole.SUPER_USER) {
    throw AppError.forbidden("Super admin access required");
  }
  next();
}

router.get("/email-templates", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const dbTemplates = await emailTemplateService.listTemplates(null);
    
    const allKeys = DEFAULT_TEMPLATES.map(d => d.templateKey);
    const dbKeysSet = new Set(dbTemplates.map(t => t.templateKey));
    
    const templates = dbTemplates.map(t => ({
      ...t,
      isCustomized: true,
      availableVariables: emailTemplateService.getAvailableVariables(t.templateKey),
    }));

    for (const key of allKeys) {
      if (!dbKeysSet.has(key)) {
        const def = getDefaultTemplate(key)!;
        templates.push({
          id: `default-${key}`,
          tenantId: null,
          templateKey: def.templateKey,
          name: def.name,
          subject: def.subject,
          htmlBody: def.htmlBody,
          textBody: def.textBody,
          variables: def.variables,
          isActive: true,
          createdByUserId: null,
          updatedByUserId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          isCustomized: false,
          availableVariables: def.variables,
        });
      }
    }

    templates.sort((a, b) => a.templateKey.localeCompare(b.templateKey));
    res.json({ templates });
  } catch (error) {
    handleRouteError(res, error, "emailTemplates.list", req);
  }
});

router.get("/email-templates/:templateKey", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const { templateKey } = req.params;
    const template = await emailTemplateService.getTemplate(null, templateKey);
    const defaultTemplate = getDefaultTemplate(templateKey);
    const availableVariables = emailTemplateService.getAvailableVariables(templateKey);

    if (!template && !defaultTemplate) {
      throw AppError.notFound("Template not found");
    }

    res.json({
      template: template || {
        id: `default-${templateKey}`,
        tenantId: null,
        templateKey: defaultTemplate!.templateKey,
        name: defaultTemplate!.name,
        subject: defaultTemplate!.subject,
        htmlBody: defaultTemplate!.htmlBody,
        textBody: defaultTemplate!.textBody,
        variables: defaultTemplate!.variables,
        isActive: true,
        createdByUserId: null,
        updatedByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      isCustomized: !!template,
      availableVariables,
    });
  } catch (error) {
    handleRouteError(res, error, "emailTemplates.get", req);
  }
});

const updateSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  htmlBody: z.string().min(1),
  textBody: z.string().min(1),
});

router.put("/email-templates/:templateKey", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const { templateKey } = req.params;
    const data = updateSchema.parse(req.body);
    const user = req.user as any;
    const availableVariables = emailTemplateService.getAvailableVariables(templateKey);

    const template = await emailTemplateService.upsertTemplate({
      tenantId: null,
      templateKey,
      name: data.name,
      subject: data.subject,
      htmlBody: data.htmlBody,
      textBody: data.textBody,
      variables: availableVariables,
      userId: user.id,
    });

    res.json({ template });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleRouteError(res, AppError.badRequest("Invalid template data"), "emailTemplates.update", req);
    }
    handleRouteError(res, error, "emailTemplates.update", req);
  }
});

router.post("/email-templates/:templateKey/reset", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const { templateKey } = req.params;
    const template = await emailTemplateService.resetToDefault(null, templateKey);
    
    if (!template) {
      throw AppError.notFound("No default template available for this key");
    }

    res.json({ template, message: "Template reset to default" });
  } catch (error) {
    handleRouteError(res, error, "emailTemplates.reset", req);
  }
});

const previewSchema = z.object({
  templateKey: z.string().min(1),
  subject: z.string().optional(),
  htmlBody: z.string().optional(),
  textBody: z.string().optional(),
});

router.post("/email-templates/preview", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const data = previewSchema.parse(req.body);
    const defaultTemplate = getDefaultTemplate(data.templateKey);
    const availableVariables = emailTemplateService.getAvailableVariables(data.templateKey);

    const sampleVars: Record<string, string> = {};
    for (const v of availableVariables) {
      sampleVars[v.name] = v.example;
    }

    const templateToRender = {
      subject: data.subject || defaultTemplate?.subject || "",
      htmlBody: data.htmlBody || defaultTemplate?.htmlBody || "",
      textBody: data.textBody || defaultTemplate?.textBody || "",
    };

    const rendered = emailTemplateService.renderTemplate(templateToRender, sampleVars);
    res.json({ rendered, sampleVariables: sampleVars });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleRouteError(res, AppError.badRequest("Invalid preview data"), "emailTemplates.preview", req);
    }
    handleRouteError(res, error, "emailTemplates.preview", req);
  }
});

router.get("/email-templates/:templateKey/variables", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const { templateKey } = req.params;
    const variables = emailTemplateService.getAvailableVariables(templateKey);
    res.json({ variables });
  } catch (error) {
    handleRouteError(res, error, "emailTemplates.variables", req);
  }
});

export default router;
