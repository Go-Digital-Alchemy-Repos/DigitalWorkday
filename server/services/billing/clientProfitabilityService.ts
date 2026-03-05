import { db } from "../../db";
import { timeEntries, users } from "@shared/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

export interface ClientProfitabilityResult {
  clientId: string;
  revenue: number;
  laborCost: number;
  grossMargin: number;
  marginPercent: number;
  billableHours: number;
  nonBillableHours: number;
  totalHours: number;
  startDate: string | null;
  endDate: string | null;
}

export interface ProfitabilityDateRange {
  startDate?: string;
  endDate?: string;
}

export async function getClientProfitability(
  clientId: string,
  tenantId: string,
  range: ProfitabilityDateRange = {}
): Promise<ClientProfitabilityResult> {
  const conditions = [
    eq(timeEntries.clientId, clientId),
    eq(timeEntries.tenantId, tenantId),
  ];

  if (range.startDate) {
    conditions.push(gte(timeEntries.startTime, new Date(range.startDate)));
  }
  if (range.endDate) {
    const end = new Date(range.endDate);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(timeEntries.startTime, end));
  }

  const rows = await db
    .select({
      durationSeconds: timeEntries.durationSeconds,
      scope: timeEntries.scope,
      costRate: users.costRate,
      billableRate: users.billableRate,
    })
    .from(timeEntries)
    .leftJoin(users, eq(timeEntries.userId, users.id))
    .where(and(...conditions));

  let revenue = 0;
  let laborCost = 0;
  let billableSeconds = 0;
  let nonBillableSeconds = 0;

  for (const row of rows) {
    const hours = (row.durationSeconds ?? 0) / 3600;
    const cost = parseFloat(row.costRate ?? "0");
    const rate = parseFloat(row.billableRate ?? "0");
    const isBillable = row.scope === "in_scope";

    if (isBillable) {
      revenue += hours * rate;
      billableSeconds += row.durationSeconds ?? 0;
    } else {
      nonBillableSeconds += row.durationSeconds ?? 0;
    }
    laborCost += hours * cost;
  }

  const grossMargin = revenue - laborCost;
  const marginPercent = revenue > 0 ? (grossMargin / revenue) * 100 : 0;
  const billableHours = parseFloat((billableSeconds / 3600).toFixed(2));
  const nonBillableHours = parseFloat((nonBillableSeconds / 3600).toFixed(2));
  const totalHours = parseFloat(((billableSeconds + nonBillableSeconds) / 3600).toFixed(2));

  return {
    clientId,
    revenue: parseFloat(revenue.toFixed(2)),
    laborCost: parseFloat(laborCost.toFixed(2)),
    grossMargin: parseFloat(grossMargin.toFixed(2)),
    marginPercent: parseFloat(marginPercent.toFixed(1)),
    billableHours,
    nonBillableHours,
    totalHours,
    startDate: range.startDate ?? null,
    endDate: range.endDate ?? null,
  };
}

export interface PortfolioClientProfitability extends ClientProfitabilityResult {
  clientName: string;
  clientId: string;
}

export async function getTenantClientsProfitability(
  tenantId: string,
  range: ProfitabilityDateRange = {},
  marginThreshold?: number
): Promise<PortfolioClientProfitability[]> {
  const conditions = [eq(timeEntries.tenantId, tenantId)];

  if (range.startDate) {
    conditions.push(gte(timeEntries.startTime, new Date(range.startDate)));
  }
  if (range.endDate) {
    const end = new Date(range.endDate);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(timeEntries.startTime, end));
  }

  const rows = await db
    .select({
      clientId: timeEntries.clientId,
      durationSeconds: timeEntries.durationSeconds,
      scope: timeEntries.scope,
      costRate: users.costRate,
      billableRate: users.billableRate,
    })
    .from(timeEntries)
    .leftJoin(users, eq(timeEntries.userId, users.id))
    .where(and(...conditions));

  const byClient = new Map<string, { revenue: number; laborCost: number; billableS: number; nonBillableS: number }>();

  for (const row of rows) {
    if (!row.clientId) continue;
    const hours = (row.durationSeconds ?? 0) / 3600;
    const cost = parseFloat(row.costRate ?? "0");
    const rate = parseFloat(row.billableRate ?? "0");
    const isBillable = row.scope === "in_scope";

    if (!byClient.has(row.clientId)) {
      byClient.set(row.clientId, { revenue: 0, laborCost: 0, billableS: 0, nonBillableS: 0 });
    }
    const acc = byClient.get(row.clientId)!;
    if (isBillable) {
      acc.revenue += hours * rate;
      acc.billableS += row.durationSeconds ?? 0;
    } else {
      acc.nonBillableS += row.durationSeconds ?? 0;
    }
    acc.laborCost += hours * cost;
  }

  const results: PortfolioClientProfitability[] = [];

  for (const [cid, acc] of byClient.entries()) {
    const grossMargin = acc.revenue - acc.laborCost;
    const marginPercent = acc.revenue > 0 ? (grossMargin / acc.revenue) * 100 : 0;

    if (marginThreshold !== undefined && marginPercent >= marginThreshold) continue;

    results.push({
      clientId: cid,
      clientName: "",
      revenue: parseFloat(acc.revenue.toFixed(2)),
      laborCost: parseFloat(acc.laborCost.toFixed(2)),
      grossMargin: parseFloat(grossMargin.toFixed(2)),
      marginPercent: parseFloat(marginPercent.toFixed(1)),
      billableHours: parseFloat((acc.billableS / 3600).toFixed(2)),
      nonBillableHours: parseFloat((acc.nonBillableS / 3600).toFixed(2)),
      totalHours: parseFloat(((acc.billableS + acc.nonBillableS) / 3600).toFixed(2)),
      startDate: range.startDate ?? null,
      endDate: range.endDate ?? null,
    });
  }

  return results.sort((a, b) => a.marginPercent - b.marginPercent);
}
