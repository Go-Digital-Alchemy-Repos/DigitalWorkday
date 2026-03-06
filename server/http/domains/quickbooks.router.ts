import { createApiRouter } from "../routerFactory";
import { config } from "../../config";
import { handleRouteError } from "../../lib/errors";
import type { Request, Response } from "express";

const router = createApiRouter({
  policy: "authTenant",
  skipEnvelope: true,
});

function requireAdmin(req: Request, res: Response): boolean {
  const user = (req as any).user;
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return false;
  }
  const role = user.role;
  if (role !== "super_user" && role !== "tenant_owner" && role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

function requireFlag(res: Response, flagName: string): boolean {
  const value = (config.features as any)[flagName];
  if (!value) {
    res.status(403).json({ error: `Feature ${flagName} is not enabled` });
    return false;
  }
  return true;
}

router.get("/status", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    if (!requireFlag(res, "enableQuickbooksSync")) return;
    const { getConnectionStatus } = await import("../../integrations/quickbooks/quickbooksAuth");
    const tenantId = (req as any).tenantId;
    const status = await getConnectionStatus(tenantId);
    res.json(status);
  } catch (error) {
    return handleRouteError(res, error, "GET /quickbooks/status", req);
  }
});

router.get("/connect", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    if (!requireFlag(res, "enableQuickbooksSync")) return;
    const { generateAuthUrl } = await import("../../integrations/quickbooks/quickbooksAuth");
    const tenantId = (req as any).tenantId;
    const url = generateAuthUrl(tenantId);
    res.json({ authUrl: url });
  } catch (error) {
    return handleRouteError(res, error, "GET /quickbooks/connect", req);
  }
});

router.get("/callback", async (req, res) => {
  try {
    const { code, realmId, state } = req.query as Record<string, string>;
    if (!code || !realmId || !state) {
      return res.status(400).json({ error: "Missing required OAuth parameters" });
    }
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    const tenantId = decoded.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "Invalid state parameter" });
    }
    const user = (req as any).user;
    const { handleOAuthCallback } = await import("../../integrations/quickbooks/quickbooksAuth");
    await handleOAuthCallback(code, realmId, tenantId, user?.id || "system");
    res.redirect("/settings/integrations?qb=connected");
  } catch (error) {
    return handleRouteError(res, error, "GET /quickbooks/callback", req);
  }
});

router.post("/disconnect", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    if (!requireFlag(res, "enableQuickbooksSync")) return;
    const { disconnectQuickBooks } = await import("../../integrations/quickbooks/quickbooksAuth");
    const tenantId = (req as any).tenantId;
    await disconnectQuickBooks(tenantId);
    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "POST /quickbooks/disconnect", req);
  }
});

router.get("/customers", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    if (!requireFlag(res, "enableQuickbooksSync")) return;
    const { listQuickBooksCustomers } = await import("../../integrations/quickbooks/quickbooksCustomerService");
    const tenantId = (req as any).tenantId;
    const { search, limit, offset } = req.query as Record<string, string>;
    const result = await listQuickBooksCustomers(tenantId, {
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
    res.json(result);
  } catch (error) {
    return handleRouteError(res, error, "GET /quickbooks/customers", req);
  }
});

router.get("/client-mappings", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    if (!requireFlag(res, "enableQuickbooksClientMapping")) return;
    const { listClientMappings } = await import("../../integrations/quickbooks/customerMappingService");
    const tenantId = (req as any).tenantId;
    const { status, search, limit, offset } = req.query as Record<string, string>;
    const result = await listClientMappings(tenantId, {
      status,
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
    res.json(result);
  } catch (error) {
    return handleRouteError(res, error, "GET /quickbooks/client-mappings", req);
  }
});

router.get("/client-mappings/:clientId", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    if (!requireFlag(res, "enableQuickbooksClientMapping")) return;
    const { getClientMapping } = await import("../../integrations/quickbooks/customerMappingService");
    const tenantId = (req as any).tenantId;
    const mapping = await getClientMapping(tenantId, req.params.clientId);
    res.json(mapping || { mappingStatus: "unmapped", clientId: req.params.clientId });
  } catch (error) {
    return handleRouteError(res, error, "GET /quickbooks/client-mappings/:clientId", req);
  }
});

router.get("/client-mappings/:clientId/suggestions", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    if (!requireFlag(res, "enableQuickbooksMappingSuggestions")) return;
    const { getSuggestedQuickBooksMatches } = await import("../../integrations/quickbooks/customerMappingSuggestionService");
    const tenantId = (req as any).tenantId;
    const suggestions = await getSuggestedQuickBooksMatches(tenantId, req.params.clientId);
    res.json({ suggestions });
  } catch (error) {
    return handleRouteError(res, error, "GET /quickbooks/client-mappings/:clientId/suggestions", req);
  }
});

router.post("/client-mappings/:clientId/link", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    if (!requireFlag(res, "enableQuickbooksClientMapping")) return;
    const { linkClientToQuickBooksCustomer } = await import("../../integrations/quickbooks/customerMappingService");
    const tenantId = (req as any).tenantId;
    const user = (req as any).user;
    const { quickbooksCustomerId, quickbooksDisplayName, method } = req.body;
    if (!quickbooksCustomerId) {
      return res.status(400).json({ error: "quickbooksCustomerId is required" });
    }
    await linkClientToQuickBooksCustomer({
      tenantId,
      clientId: req.params.clientId,
      quickbooksCustomerId,
      quickbooksDisplayName,
      actingUserId: user.id,
      method,
    });
    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "POST /quickbooks/client-mappings/:clientId/link", req);
  }
});

router.post("/client-mappings/:clientId/unlink", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    if (!requireFlag(res, "enableQuickbooksClientMapping")) return;
    const { unlinkClientMapping } = await import("../../integrations/quickbooks/customerMappingService");
    const tenantId = (req as any).tenantId;
    const user = (req as any).user;
    await unlinkClientMapping({
      tenantId,
      clientId: req.params.clientId,
      actingUserId: user.id,
    });
    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "POST /quickbooks/client-mappings/:clientId/unlink", req);
  }
});

router.post("/client-mappings/:clientId/lock", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    if (!requireFlag(res, "enableQuickbooksClientMapping")) return;
    const { lockClientMapping } = await import("../../integrations/quickbooks/customerMappingService");
    const tenantId = (req as any).tenantId;
    const user = (req as any).user;
    const { locked } = req.body;
    if (typeof locked !== "boolean") {
      return res.status(400).json({ error: "locked (boolean) is required" });
    }
    await lockClientMapping({
      tenantId,
      clientId: req.params.clientId,
      locked,
      actingUserId: user.id,
    });
    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "POST /quickbooks/client-mappings/:clientId/lock", req);
  }
});

router.post("/client-mappings/:clientId/create-customer", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    if (!requireFlag(res, "enableQuickbooksCustomerImport")) return;
    const { createQuickBooksCustomerFromClient } = await import("../../integrations/quickbooks/quickbooksCustomerService");
    const { linkClientToQuickBooksCustomer } = await import("../../integrations/quickbooks/customerMappingService");

    const tenantId = (req as any).tenantId;
    const user = (req as any).user;
    const clientId = req.params.clientId;

    const { db: dbModule } = await import("../../db");
    const { clients: clientsTable } = await import("@shared/schema");
    const { eq, and } = await import("drizzle-orm");
    const [client] = await dbModule.select()
      .from(clientsTable)
      .where(and(eq(clientsTable.id, clientId), eq(clientsTable.tenantId, tenantId)))
      .limit(1);

    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    const qbCustomer = await createQuickBooksCustomerFromClient(tenantId, {
      companyName: client.companyName,
      displayName: client.displayName || undefined,
      email: client.email || undefined,
      phone: client.phone || undefined,
      addressLine1: client.addressLine1 || undefined,
      city: client.city || undefined,
      state: client.state || undefined,
      postalCode: client.postalCode || undefined,
      country: client.country || undefined,
    });

    await linkClientToQuickBooksCustomer({
      tenantId,
      clientId,
      quickbooksCustomerId: qbCustomer.id,
      quickbooksDisplayName: qbCustomer.displayName,
      actingUserId: user.id,
      method: "created_from_dw",
    });

    res.json({ success: true, customer: qbCustomer });
  } catch (error) {
    return handleRouteError(res, error, "POST /quickbooks/client-mappings/:clientId/create-customer", req);
  }
});

router.post("/client-mappings/:clientId/sync-update", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    if (!requireFlag(res, "enableQuickbooksClientMapping")) return;
    const { refreshClientMappingStatus } = await import("../../integrations/quickbooks/customerMappingService");
    const tenantId = (req as any).tenantId;
    const user = (req as any).user;
    await refreshClientMappingStatus({
      tenantId,
      clientId: req.params.clientId,
      actingUserId: user.id,
    });
    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "POST /quickbooks/client-mappings/:clientId/sync-update", req);
  }
});

router.get("/sync-logs", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    if (!requireFlag(res, "enableQuickbooksSync")) return;
    const { getMappingSyncLogs } = await import("../../integrations/quickbooks/customerMappingService");
    const tenantId = (req as any).tenantId;
    const { clientId, limit } = req.query as Record<string, string>;
    const logs = await getMappingSyncLogs(tenantId, clientId || undefined, limit ? parseInt(limit, 10) : 20);
    res.json({ logs });
  } catch (error) {
    return handleRouteError(res, error, "GET /quickbooks/sync-logs", req);
  }
});

export default router;
