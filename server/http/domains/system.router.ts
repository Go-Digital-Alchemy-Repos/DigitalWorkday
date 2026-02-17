import { createApiRouter } from "../routerFactory";
import systemIntegrationsRouter from "../../routes/systemIntegrations";

const systemRouter = createApiRouter({
  policy: "superUser",
});

systemRouter.use(systemIntegrationsRouter);

export default systemRouter;
