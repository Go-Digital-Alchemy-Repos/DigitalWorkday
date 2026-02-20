import { createApiRouter } from "../routerFactory";
import { config } from "../../config";
import { handleRouteError } from "../../lib/errors";

const router = createApiRouter({
  policy: "authTenant",
  skipEnvelope: true,
});

router.get("/crm/flags", async (_req, res) => {
  try {
    res.json({
      client360: config.crm.client360Enabled,
      contacts: config.crm.contactsEnabled,
      timeline: config.crm.timelineEnabled,
      portal: config.crm.portalEnabled,
      files: config.crm.filesEnabled,
      approvals: config.crm.approvalsEnabled,
      clientMessaging: config.crm.clientMessagingEnabled,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/flags", _req);
  }
});

router.get("/features/flags", async (_req, res) => {
  try {
    res.json({
      assetLibraryV2: config.features.assetLibraryV2,
      clientWorkspaceV2: config.features.clientWorkspaceV2,
      documentsUsingAssets: config.features.documentsUsingAssets,
      clientProfileLayoutV2: config.features.clientProfileLayoutV2,
      clientCommandPaletteV1: config.features.clientCommandPaletteV1,
      clientControlCenterPremium: config.features.clientControlCenterPremium,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/features/flags", _req);
  }
});

export default router;
