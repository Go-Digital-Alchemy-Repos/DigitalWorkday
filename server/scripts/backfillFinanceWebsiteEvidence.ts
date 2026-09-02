import { eq } from "drizzle-orm";
import { db } from "../db";
import { financeWebsiteAssignments } from "@shared/schema";
import {
  suggestAssignments,
  type HostingEvidenceLine,
} from "../http/domains/financeAudit.router";
import { tenantIntegrationService } from "../services/tenantIntegrations";

const HOSTING_ITEM_PATTERN = /hosting/i;
const ALL_DATES_START = "2010-01-01";

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,'"()&]/g, " ")
    .replace(/\b(llc|inc|incorporated|ltd|limited|co|corp|corporation|company)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const apply = process.argv.includes("--apply");
  const assignments = await db.select().from(financeWebsiteAssignments);
  const tenantIds = Array.from(new Set(assignments.map(row => row.tenantId)));
  const updates: Array<{
    id: string;
    domain: string | null;
    customerName: string;
    evidenceSource: string;
    evidenceDetails: string;
  }> = [];
  const unresolved: Array<{ domain: string | null; customerName: string; suggestedCustomer: string | null }> = [];

  for (const tenantId of tenantIds) {
    const tenantAssignments = assignments.filter(row => row.tenantId === tenantId);
    const installs = await tenantIntegrationService.listWPEngineInstalls(tenantId);
    const production = installs.filter(install => install.environment === "production" && install.status !== "inactive");
    const invoices = await tenantIntegrationService.fetchQuickBooksInvoices(tenantId, ALL_DATES_START);
    const salesReceipts = await tenantIntegrationService.fetchQuickBooksSalesReceipts(tenantId, ALL_DATES_START);
    const customerNames = Array.from(new Set(
      [...invoices, ...salesReceipts]
        .map(transaction => transaction.customerName)
        .filter((name): name is string => Boolean(name)),
    ));
    const hostingEvidence = new Map<string, HostingEvidenceLine[]>();

    const addLines = (
      transactions: Array<{ customerName: string | null; lines: Array<{ itemName: string | null; description: string | null }> }>,
      transactionType: HostingEvidenceLine["transactionType"],
    ) => {
      for (const transaction of transactions) {
        if (!transaction.customerName) continue;
        for (const line of transaction.lines) {
          if (!line.itemName || !HOSTING_ITEM_PATTERN.test(line.itemName) || !line.description) continue;
          const list = hostingEvidence.get(transaction.customerName) || [];
          list.push({ description: line.description.toLowerCase(), transactionType });
          hostingEvidence.set(transaction.customerName, list);
        }
      }
    };
    addLines(invoices, "invoice");
    addLines(salesReceipts, "sales_receipt");

    const suggestions = suggestAssignments(production, customerNames, hostingEvidence);
    for (const assignment of tenantAssignments) {
      const suggestion = suggestions.get(assignment.wpeInstallId) || null;
      const aligned = Boolean(
        suggestion
        && normalizeCompanyName(suggestion.customerName) === normalizeCompanyName(assignment.customerName),
      );
      if (!suggestion || !aligned) {
        unresolved.push({
          domain: assignment.primaryDomain,
          customerName: assignment.customerName,
          suggestedCustomer: suggestion?.customerName || null,
        });
        continue;
      }
      updates.push({
        id: assignment.id,
        domain: assignment.primaryDomain,
        customerName: assignment.customerName,
        evidenceSource: suggestion.evidenceSource,
        evidenceDetails: suggestion.evidence,
      });
    }
  }

  if (apply) {
    await db.transaction(async tx => {
      for (const update of updates) {
        await tx
          .update(financeWebsiteAssignments)
          .set({
            evidenceSource: update.evidenceSource,
            evidenceDetails: update.evidenceDetails,
            updatedAt: new Date(),
          })
          .where(eq(financeWebsiteAssignments.id, update.id));
      }
    });
  }

  const bySource = Object.fromEntries(
    Array.from(new Set(updates.map(update => update.evidenceSource)))
      .sort()
      .map(source => [source, updates.filter(update => update.evidenceSource === source).length]),
  );
  console.log(JSON.stringify({
    mode: apply ? "applied" : "preview",
    allDatesStart: ALL_DATES_START,
    assignments: assignments.length,
    updateCount: updates.length,
    unresolvedCount: unresolved.length,
    bySource,
    unresolved,
  }, null, 2));
}

main().then(() => process.exit(0)).catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
