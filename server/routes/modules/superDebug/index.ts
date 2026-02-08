import { Router } from "express";
import quarantineRouter from "./quarantine.router";
import backfillRouter from "./backfill.router";
import diagnosticsRouter from "./diagnostics.router";

const router = Router();

router.use(quarantineRouter);
router.use(backfillRouter);
router.use(diagnosticsRouter);

export default router;
