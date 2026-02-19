import { createApiRouter } from "../../routerFactory";
import timersRouter from "./timers.routes";
import entriesRouter from "./entries.routes";
import reportsRouter from "./reports.routes";
import calendarRouter from "./calendar.routes";

const router = createApiRouter({
  policy: "authTenant",
  skipEnvelope: true,
});

router.use("/", reportsRouter);
router.use("/", timersRouter);
router.use("/", entriesRouter);
router.use("/", calendarRouter);

export default router;
