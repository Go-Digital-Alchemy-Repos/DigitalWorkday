import express, { type Request, Response, NextFunction } from "express";
import { createServer, type Server as HttpServer } from "http";
import { requestIdMiddleware } from "./middleware/requestId";
import { errorHandler } from "./middleware/errorHandler";
import { errorLoggingMiddleware } from "./middleware/errorLogging";
import { apiJsonResponseGuard, apiNotFoundHandler } from "./middleware/apiJsonGuard";
import { tenantContextMiddleware } from "./middleware/tenantContext";
import { agreementEnforcementGuard } from "./middleware/agreementEnforcement";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export interface CreateAppOptions {
  testMode?: boolean;
  withAuth?: boolean;
  mockUser?: {
    id: string;
    tenantId?: string | null;
    role?: string;
  };
}

export interface AppInstance {
  app: express.Express;
  httpServer: HttpServer;
}

export function createApp(options: CreateAppOptions = {}): AppInstance {
  const { testMode = false, withAuth = false, mockUser } = options;
  const app = express();
  const httpServer = createServer(app);

  app.set("trust proxy", 1);

  app.use(requestIdMiddleware);

  app.use(
    express.json({
      limit: testMode ? "1mb" : "10mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));

  if (testMode && mockUser) {
    app.use((req: any, _res: Response, next: NextFunction) => {
      req.isAuthenticated = () => true;
      req.user = {
        id: mockUser.id,
        tenantId: mockUser.tenantId ?? null,
        role: mockUser.role ?? "employee",
      };
      req.session = { passport: { user: mockUser.id } };
      req.tenant = mockUser.tenantId
        ? { effectiveTenantId: mockUser.tenantId }
        : undefined;
      next();
    });
  } else if (testMode && !withAuth) {
    app.use((req: any, _res: Response, next: NextFunction) => {
      req.isAuthenticated = () => false;
      req.user = null;
      next();
    });
  }

  if (!testMode) {
    app.use(tenantContextMiddleware);
    app.use(agreementEnforcementGuard);
  }

  app.use(apiJsonResponseGuard);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  return { app, httpServer };
}

export async function createAppWithRoutes(
  options: CreateAppOptions = {},
): Promise<AppInstance> {
  const instance = createApp(options);
  const { app, httpServer } = instance;

  const { mountAllRoutes } = await import("./http/mount");
  await mountAllRoutes(httpServer, app);

  app.use(apiNotFoundHandler);
  app.use(errorLoggingMiddleware);
  app.use(errorHandler);

  return instance;
}
