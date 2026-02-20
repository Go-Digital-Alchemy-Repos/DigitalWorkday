import { z } from "zod";
import { createApiRouter } from "../routerFactory";
import { db } from "../../db";
import { controlCenterWidgetLayouts } from "@shared/schema";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import { AppError, handleRouteError } from "../../lib/errors";
import {
  WIDGET_MAP,
  MAX_PINNED_WIDGETS,
  getDefaultLayout,
  sanitizeLayout,
  filterLayoutByRole,
  type WidgetLayoutItem,
} from "@shared/controlCenterWidgets";
import { eq, and, isNull } from "drizzle-orm";

const router = createApiRouter({ policy: "authTenant", skipEnvelope: true });

function getUserRole(req: any): "admin" | "employee" {
  const role = (req.user as any)?.role;
  if (role === "admin" || role === "super_user") return "admin";
  return "employee";
}

const layoutItemSchema = z.object({
  id: z.string(),
  order: z.number().int().min(0),
  size: z.enum(["sm", "md", "lg"]).optional(),
});

const putLayoutSchema = z.object({
  workspaceId: z.string().optional().nullable(),
  layout: z.array(layoutItemSchema).max(MAX_PINNED_WIDGETS),
});

router.get("/control-center/widgets/layout", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const workspaceId = (req.query.workspaceId as string) || null;
    const role = getUserRole(req);

    const conditions = workspaceId
      ? and(
          eq(controlCenterWidgetLayouts.tenantId, tenantId),
          eq(controlCenterWidgetLayouts.workspaceId, workspaceId),
        )
      : and(
          eq(controlCenterWidgetLayouts.tenantId, tenantId),
          isNull(controlCenterWidgetLayouts.workspaceId),
        );

    const [row] = await db
      .select()
      .from(controlCenterWidgetLayouts)
      .where(conditions);

    let layout: WidgetLayoutItem[];
    if (row) {
      layout = sanitizeLayout(row.layoutJson as WidgetLayoutItem[]);
    } else {
      layout = getDefaultLayout(role);
    }

    layout = filterLayoutByRole(layout, role);

    res.json({ layout, isDefault: !row });
  } catch (error) {
    return handleRouteError(res, error, "GET /control-center/widgets/layout", req);
  }
});

router.put("/control-center/widgets/layout", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const role = getUserRole(req);
    if (role !== "admin") {
      throw AppError.forbidden("Only admins can customize widget layout");
    }

    const body = putLayoutSchema.parse(req.body);
    const userId = (req.user as any)?.id;

    for (const item of body.layout) {
      if (!WIDGET_MAP.has(item.id)) {
        throw AppError.badRequest(`Unknown widget id: ${item.id}`);
      }
    }

    const sanitized = sanitizeLayout(body.layout);
    const workspaceId = body.workspaceId || null;

    const conditions = workspaceId
      ? and(
          eq(controlCenterWidgetLayouts.tenantId, tenantId),
          eq(controlCenterWidgetLayouts.workspaceId, workspaceId),
        )
      : and(
          eq(controlCenterWidgetLayouts.tenantId, tenantId),
          isNull(controlCenterWidgetLayouts.workspaceId),
        );

    const [existing] = await db
      .select()
      .from(controlCenterWidgetLayouts)
      .where(conditions);

    if (existing) {
      await db
        .update(controlCenterWidgetLayouts)
        .set({
          layoutJson: sanitized,
          updatedByUserId: userId,
          updatedAt: new Date(),
        })
        .where(eq(controlCenterWidgetLayouts.id, existing.id));
    } else {
      await db.insert(controlCenterWidgetLayouts).values({
        tenantId,
        workspaceId,
        createdByUserId: userId,
        updatedByUserId: userId,
        layoutJson: sanitized,
      });
    }

    res.json({ layout: sanitized, saved: true });
  } catch (error) {
    return handleRouteError(res, error, "PUT /control-center/widgets/layout", req);
  }
});

export default router;
