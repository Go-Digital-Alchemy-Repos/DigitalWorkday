import { Router } from "express";
import clientsRouter from "./router";
import divisionsRouter from "./divisions.router";
import portalRouter from "./portal.router";

const router = Router();

router.use("/clients", clientsRouter);
router.use("/clients", portalRouter);
router.use("/v1", divisionsRouter);

export default router;
