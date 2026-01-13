import { db } from "../db";
import { tenancyWarnings } from "@shared/schema";
import { eq, gte, and, sql, desc } from "drizzle-orm";

export interface TenancyWarningRecord {
  route: string;
  method: string;
  warnType: "mismatch" | "missing-tenantId";
  actorUserId?: string;
  effectiveTenantId?: string;
  resourceId?: string;
  notes?: string;
  timestamp: Date;
}

interface WarningStats {
  total: number;
  byType: Record<string, number>;
  byRoute: Record<string, number>;
}

class TenancyHealthTracker {
  private warnings: TenancyWarningRecord[] = [];
  private routeCounters: Map<string, Map<string, number>> = new Map();
  private lastCleanup: Date = new Date();
  private readonly maxInMemoryWarnings = 10000;
  private readonly cleanupIntervalMs = 60 * 60 * 1000; // 1 hour

  private isPersistEnabled(): boolean {
    return process.env.TENANCY_WARN_PERSIST?.toLowerCase() === "true";
  }

  async recordWarning(warning: Omit<TenancyWarningRecord, "timestamp">): Promise<void> {
    const record: TenancyWarningRecord = {
      ...warning,
      timestamp: new Date(),
    };

    this.warnings.push(record);

    const routeKey = `${warning.method}:${warning.route}`;
    if (!this.routeCounters.has(routeKey)) {
      this.routeCounters.set(routeKey, new Map());
    }
    const routeMap = this.routeCounters.get(routeKey)!;
    routeMap.set(warning.warnType, (routeMap.get(warning.warnType) || 0) + 1);

    if (this.warnings.length > this.maxInMemoryWarnings) {
      this.warnings = this.warnings.slice(-this.maxInMemoryWarnings / 2);
    }

    if (this.isPersistEnabled()) {
      try {
        await db.insert(tenancyWarnings).values({
          route: warning.route,
          method: warning.method,
          warnType: warning.warnType,
          actorUserId: warning.actorUserId || null,
          effectiveTenantId: warning.effectiveTenantId || null,
          resourceId: warning.resourceId || null,
          notes: warning.notes || null,
        });
      } catch (error) {
        console.error("[TenancyHealthTracker] Failed to persist warning:", error);
      }
    }
  }

  getInMemoryStats(since?: Date): WarningStats {
    const cutoff = since || new Date(0);
    const relevantWarnings = this.warnings.filter(w => w.timestamp >= cutoff);

    const byType: Record<string, number> = {};
    const byRoute: Record<string, number> = {};

    for (const warning of relevantWarnings) {
      byType[warning.warnType] = (byType[warning.warnType] || 0) + 1;
      const routeKey = `${warning.method}:${warning.route}`;
      byRoute[routeKey] = (byRoute[routeKey] || 0) + 1;
    }

    return {
      total: relevantWarnings.length,
      byType,
      byRoute,
    };
  }

  async getDbStats(since: Date): Promise<WarningStats> {
    if (!this.isPersistEnabled()) {
      return { total: 0, byType: {}, byRoute: {} };
    }

    try {
      const typeStats = await db
        .select({
          warnType: tenancyWarnings.warnType,
          count: sql<number>`count(*)::int`,
        })
        .from(tenancyWarnings)
        .where(gte(tenancyWarnings.occurredAt, since))
        .groupBy(tenancyWarnings.warnType);

      const routeStats = await db
        .select({
          route: tenancyWarnings.route,
          method: tenancyWarnings.method,
          count: sql<number>`count(*)::int`,
        })
        .from(tenancyWarnings)
        .where(gte(tenancyWarnings.occurredAt, since))
        .groupBy(tenancyWarnings.route, tenancyWarnings.method)
        .orderBy(desc(sql`count(*)`))
        .limit(10);

      const byType: Record<string, number> = {};
      let total = 0;
      for (const stat of typeStats) {
        byType[stat.warnType] = stat.count;
        total += stat.count;
      }

      const byRoute: Record<string, number> = {};
      for (const stat of routeStats) {
        byRoute[`${stat.method}:${stat.route}`] = stat.count;
      }

      return { total, byType, byRoute };
    } catch (error) {
      console.error("[TenancyHealthTracker] Failed to fetch DB stats:", error);
      return { total: 0, byType: {}, byRoute: {} };
    }
  }

  async getWarnings(options: {
    from?: Date;
    to?: Date;
    tenantId?: string;
    limit?: number;
    offset?: number;
  }) {
    if (!this.isPersistEnabled()) {
      return { warnings: [], total: 0, persistEnabled: false };
    }

    try {
      const conditions = [];
      if (options.from) {
        conditions.push(gte(tenancyWarnings.occurredAt, options.from));
      }
      if (options.to) {
        conditions.push(sql`${tenancyWarnings.occurredAt} <= ${options.to}`);
      }
      if (options.tenantId) {
        conditions.push(eq(tenancyWarnings.effectiveTenantId, options.tenantId));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [warnings, countResult] = await Promise.all([
        db
          .select()
          .from(tenancyWarnings)
          .where(whereClause)
          .orderBy(desc(tenancyWarnings.occurredAt))
          .limit(options.limit || 100)
          .offset(options.offset || 0),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(tenancyWarnings)
          .where(whereClause),
      ]);

      return {
        warnings,
        total: countResult[0]?.count || 0,
        persistEnabled: true,
      };
    } catch (error) {
      console.error("[TenancyHealthTracker] Failed to fetch warnings:", error);
      return { warnings: [], total: 0, persistEnabled: true, error: String(error) };
    }
  }

  getTopRoutes(limit = 5): Array<{ route: string; method: string; count: number }> {
    const routeTotals: Map<string, number> = new Map();
    
    Array.from(this.routeCounters.entries()).forEach(([routeKey, typeMap]) => {
      let total = 0;
      Array.from(typeMap.values()).forEach((count) => {
        total += count;
      });
      routeTotals.set(routeKey, total);
    });

    return Array.from(routeTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key, count]) => {
        const [method, ...routeParts] = key.split(":");
        return { method, route: routeParts.join(":"), count };
      });
  }

  isPersistenceEnabled(): boolean {
    return this.isPersistEnabled();
  }

  clearInMemory(): void {
    this.warnings = [];
    this.routeCounters.clear();
  }
}

export const tenancyHealthTracker = new TenancyHealthTracker();
