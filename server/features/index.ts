import { Router } from "express";
import clientsFeature from "./clients";
import { notificationsRouter } from "./notifications";
import clientPortalFeature from "./client-portal";

const router = Router();

router.use(clientsFeature);
router.use(notificationsRouter);
router.use(clientPortalFeature);

export default router;
