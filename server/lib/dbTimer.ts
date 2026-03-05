import type { Request, Response, NextFunction } from "express";

export interface DbMetrics {
  queryCount: number;
  totalMs: number;
}

const reqMetricsMap = new WeakMap<Request, DbMetrics>();

export function getDbMetrics(req: Request): DbMetrics | undefined {
  return reqMetricsMap.get(req);
}

export function trackDbQuery(req: Request, durationMs: number): void {
  let metrics = reqMetricsMap.get(req);
  if (!metrics) {
    metrics = { queryCount: 0, totalMs: 0 };
    reqMetricsMap.set(req, metrics);
  }
  metrics.queryCount++;
  metrics.totalMs += durationMs;
}

export function dbTimerMiddleware(req: Request, _res: Response, next: NextFunction): void {
  reqMetricsMap.set(req, { queryCount: 0, totalMs: 0 });
  next();
}
