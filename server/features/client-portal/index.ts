import { Router } from "express";
import portalRouter from "./portal.router";

const router = Router();

router.use("/client-portal", portalRouter);

export default router;
