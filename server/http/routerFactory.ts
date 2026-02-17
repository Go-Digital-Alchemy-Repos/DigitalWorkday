import { Router } from "express";
import type { RequestHandler } from "express";
import { getPolicyMiddleware, type PolicyName } from "./policy/requiredMiddleware";
import { responseEnvelopeMiddleware } from "./policy/responseEnvelope";

export interface RouterFactoryOptions {
  policy: PolicyName;
  allowlist?: string[];
  skipEnvelope?: boolean;
}

export interface FactoryRouterMeta {
  policy: PolicyName;
  allowlist: string[];
  createdAt: string;
}

const ROUTER_META = new WeakMap<Router, FactoryRouterMeta>();

export function createApiRouter(options: RouterFactoryOptions): Router {
  const { policy, allowlist = [], skipEnvelope = false } = options;
  const router = Router();

  if (!skipEnvelope) {
    router.use(responseEnvelopeMiddleware);
  }

  const policyMiddleware = getPolicyMiddleware(policy);

  if (policyMiddleware.length > 0 && allowlist.length > 0) {
    const allowlistSet = new Set(allowlist);

    const conditionalGuard: RequestHandler = (req, res, next) => {
      const matchesAllowlist = allowlistSet.has(req.path) ||
        Array.from(allowlistSet).some(pattern =>
          pattern.endsWith("/*") && req.path.startsWith(pattern.slice(0, -2))
        );

      if (matchesAllowlist) {
        return next();
      }

      let idx = 0;
      const runNext = (err?: any) => {
        if (err) return next(err);
        if (idx >= policyMiddleware.length) return next();
        const mw = policyMiddleware[idx++];
        mw(req, res, runNext);
      };
      runNext();
    };

    router.use(conditionalGuard);
  } else if (policyMiddleware.length > 0) {
    for (const mw of policyMiddleware) {
      router.use(mw);
    }
  }

  ROUTER_META.set(router, {
    policy,
    allowlist,
    createdAt: new Date().toISOString(),
  });

  return router;
}

export function getRouterMeta(router: Router): FactoryRouterMeta | undefined {
  return ROUTER_META.get(router);
}
