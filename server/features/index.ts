import { createApiRouter } from "../http/routerFactory";
import clientsFeature from "./clients";
import { notificationsRouter } from "./notifications";
import templatesFeature from "./templates";

const router = createApiRouter({ policy: "authTenant" });

router.use(clientsFeature);
router.use(notificationsRouter);
router.use(templatesFeature);

export default router;
