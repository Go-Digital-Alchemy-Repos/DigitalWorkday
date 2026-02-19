import { createApiRouter } from "../../routerFactory";
import channelsRouter from "./channels.routes";
import messagesRouter from "./messages.routes";
import dmRouter from "./dm.routes";
import searchRouter from "./search.routes";

const router = createApiRouter({
  policy: "authTenant",
  skipEnvelope: true,
});

router.use("/", searchRouter);
router.use("/", channelsRouter);
router.use("/", messagesRouter);
router.use("/", dmRouter);

export default router;
