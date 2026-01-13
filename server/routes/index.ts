import { Router } from "express";
import timerRoutes from "./timeTracking";
import superAdminRoutes from "./superAdmin";

const router = Router();

router.use("/timer", timerRoutes);
router.use("/v1/super", superAdminRoutes);

export default router;
