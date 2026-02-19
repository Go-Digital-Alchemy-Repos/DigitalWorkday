import { Router } from "express";
import portalRouter from "./portal.router";
import supportRouter from "./support.router";

const router = Router();

router.use("/client-portal", portalRouter);
router.use("/v1/portal/support", supportRouter);

export default router;
