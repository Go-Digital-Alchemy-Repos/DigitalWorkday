import { Router } from "express";
import portalRouter from "./portal.router";
import supportRouter from "./support.router";
import workspaceRouter from "./workspace.router";
import assetsRouter from "./assets.router";

const router = Router();

router.use("/client-portal", portalRouter);
router.use("/client-portal", workspaceRouter);
router.use("/client-portal", assetsRouter);
router.use("/v1/portal/support", supportRouter);

export default router;
