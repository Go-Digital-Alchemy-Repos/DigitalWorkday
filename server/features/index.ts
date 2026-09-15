import { createApiRouter } from "../http/routerFactory";
import clientsFeature from "./clients";
import { notificationsRouter } from "./notifications";
import clientPortalFeature from "./client-portal";
import templatesFeature from "./templates";
import { blockClientUsers } from "../middleware/clientAccess";

const router = createApiRouter({ policy: "authTenant" });

// This bundle intentionally contains shared portal routes. Keep the shared
// boundary tenant-authenticated and explicitly deny portal users at every
// internal feature prefix.
router.use("/clients", blockClientUsers);
router.use("/v1/clients", blockClientUsers);
router.use("/v1/divisions", blockClientUsers);
router.use("/templates", blockClientUsers);
router.use(clientsFeature);
router.use(notificationsRouter);
router.use(clientPortalFeature);
router.use(templatesFeature);

export default router;
