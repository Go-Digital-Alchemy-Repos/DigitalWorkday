import { sql } from "drizzle-orm";
import { dbRows } from "../../lib/dbHelpers";

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
  const dateConditions: ReturnType<typeof sql>[] = [];
  if (range.startDate) {
    dateConditions.push(sql`AND te.start_time >= ${new Date(range.startDate)}`);
  }
  if (range.endDate) {
    const end = new Date(range.endDate);
    end.setHours(23, 59, 59, 999);
    dateConditions.push(sql`AND te.start_time <= ${end}`);
  }
  const dateFilter = dateConditions.length > 0 ? sql.join(dateConditions, sql` `) : sql``;

  const rows = await dbRows<{
    revenue: string;
    labor_cost: string;
    billable_seconds: string;
    non_billable_seconds: string;
  }>(sql`
    SELECT
      COALESCE(SUM(CASE WHEN te.scope = 'in_scope' THEN (te.duration_seconds / 3600.0) * COALESCE(u.billable_rate::numeric, 0) ELSE 0 END), 0) AS revenue,
      COALESCE(SUM((te.duration_seconds / 3600.0) * COALESCE(u.cost_rate::numeric, 0)), 0) AS labor_cost,
      COALESCE(SUM(CASE WHEN te.scope = 'in_scope' THEN te.duration_seconds ELSE 0 END), 0) AS billable_seconds,
      COALESCE(SUM(CASE WHEN te.scope != 'in_scope' OR te.scope IS NULL THEN te.duration_seconds ELSE 0 END), 0) AS non_billable_seconds
    FROM time_entries te
    LEFT JOIN users u ON te.user_id = u.id
    WHERE te.client_id = ${clientId}
      AND te.tenant_id = ${tenantId}
      ${dateFilter}
  `);

  const row = rows[0];

  const revenueRaw = row ? Number(row.revenue) : 0;
  const laborCostRaw = row ? Number(row.labor_cost) : 0;
  const billableSeconds = row ? Number(row.billable_seconds) : 0;
  const nonBillableSeconds = row ? Number(row.non_billable_seconds) : 0;
  const grossMarginRaw = revenueRaw - laborCostRaw;
  const marginPercentRaw = revenueRaw > 0 ? (grossMarginRaw / revenueRaw) * 100 : 0;
  const billableHours = parseFloat((billableSeconds / 3600).toFixed(2));
  const nonBillableHours = parseFloat((nonBillableSeconds / 3600).toFixed(2));
  const totalHours = parseFloat(((billableSeconds + nonBillableSeconds) / 3600).toFixed(2));

  return {
    clientId,
    revenue: parseFloat(revenueRaw.toFixed(2)),
    laborCost: parseFloat(laborCostRaw.toFixed(2)),
    grossMargin: parseFloat(grossMarginRaw.toFixed(2)),
    marginPercent: parseFloat(marginPercentRaw.toFixed(1)),
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
  const dateConditions: ReturnType<typeof sql>[] = [];
  if (range.startDate) {
    dateConditions.push(sql`AND te.start_time >= ${new Date(range.startDate)}`);
  }
  if (range.endDate) {
    const end = new Date(range.endDate);
    end.setHours(23, 59, 59, 999);
    dateConditions.push(sql`AND te.start_time <= ${end}`);
  }
  const dateFilter = dateConditions.length > 0 ? sql.join(dateConditions, sql` `) : sql``;

  const resultRows = await dbRows<{
    client_id: string;
    revenue: string;
    labor_cost: string;
    billable_seconds: string;
    non_billable_seconds: string;
  }>(sql`
    SELECT
      te.client_id,
      COALESCE(SUM(CASE WHEN te.scope = 'in_scope' THEN (te.duration_seconds / 3600.0) * COALESCE(u.billable_rate::numeric, 0) ELSE 0 END), 0) AS revenue,
      COALESCE(SUM((te.duration_seconds / 3600.0) * COALESCE(u.cost_rate::numeric, 0)), 0) AS labor_cost,
      COALESCE(SUM(CASE WHEN te.scope = 'in_scope' THEN te.duration_seconds ELSE 0 END), 0) AS billable_seconds,
      COALESCE(SUM(CASE WHEN te.scope != 'in_scope' OR te.scope IS NULL THEN te.duration_seconds ELSE 0 END), 0) AS non_billable_seconds
    FROM time_entries te
    LEFT JOIN users u ON te.user_id = u.id
    WHERE te.tenant_id = ${tenantId}
      AND te.client_id IS NOT NULL
      ${dateFilter}
    GROUP BY te.client_id
  `);

  const results: PortfolioClientProfitability[] = [];

  for (const row of resultRows) {
    const revenueRaw = Number(row.revenue);
    const laborCostRaw = Number(row.labor_cost);
    const billableSeconds = Number(row.billable_seconds);
    const nonBillableSeconds = Number(row.non_billable_seconds);
    const grossMarginRaw = revenueRaw - laborCostRaw;
    const marginPercentRaw = revenueRaw > 0 ? (grossMarginRaw / revenueRaw) * 100 : 0;

    if (marginThreshold !== undefined && marginPercentRaw >= marginThreshold) continue;

    results.push({
      clientId: row.client_id,
      clientName: "",
      revenue: parseFloat(revenueRaw.toFixed(2)),
      laborCost: parseFloat(laborCostRaw.toFixed(2)),
      grossMargin: parseFloat(grossMarginRaw.toFixed(2)),
      marginPercent: parseFloat(marginPercentRaw.toFixed(1)),
      billableHours: parseFloat((billableSeconds / 3600).toFixed(2)),
      nonBillableHours: parseFloat((nonBillableSeconds / 3600).toFixed(2)),
      totalHours: parseFloat(((billableSeconds + nonBillableSeconds) / 3600).toFixed(2)),
      startDate: range.startDate ?? null,
      endDate: range.endDate ?? null,
    });
  }

  return results.sort((a, b) => a.marginPercent - b.marginPercent);
}
