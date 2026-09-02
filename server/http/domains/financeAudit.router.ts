import type { RequestHandler } from "express";
import { and, eq } from "drizzle-orm";
import { createApiRouter } from "../routerFactory";
import { db } from "../../db";
import { clients, financeWebsiteAssignments } from "@shared/schema";
import { AppError, handleRouteError } from "../../lib/errors";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import {
  tenantIntegrationService,
  type QuickBooksInvoiceSummary,
  type QuickBooksSalesReceiptSummary,
  type WPEngineInstallSummary,
} from "../../services/tenantIntegrations";
import { emailEvidenceByInstallName } from "./financeEmailEvidence";

const router = createApiRouter({
  policy: "authTenant",
  skipEnvelope: true,
});

/**
 * Finance visibility is a per-user grant (users.can_view_finance), not a role.
 * Role checks are intentionally absent: an admin without the grant is denied.
 */
const requireFinanceAccess: RequestHandler = (req, _res, next) => {
  const user = req.user as any;
  if (!user?.canViewFinance) {
    return next(AppError.forbidden("Finance access required"));
  }
  next();
};

router.use(requireFinanceAccess);

const WPE_TAG_PATTERN = /wp[\s_-]?engine/i;

// Digital Alchemy bills hosting under the QBO service item "Website Hosting"
// (item id 3). Matching on item name keeps the audit correct if the id ever
// changes but the naming convention holds.
const HOSTING_ITEM_PATTERN = /hosting/i;

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,'"()&]/g, " ")
    .replace(/\b(llc|inc|incorporated|ltd|limited|co|corp|corporation|company)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type AuditStatus = "never_billed" | "overdue" | "ok" | "unmatched";

/** Compact form for fuzzy identity comparison: "Sun Stoppers Inc" -> "sunstoppers". */
function compactName(name: string): string {
  return normalizeCompanyName(name).replace(/\s+/g, "");
}

/** Bare domain identity: "www.sunstoppersconcord.com" -> "sunstoppersconcord". */
function bareDomain(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.[a-z.]+$/, "")
    .replace(/[^a-z0-9]/g, "");
}

interface AssignmentSuggestion {
  customerName: string;
  confidence: "high" | "medium" | "low";
  evidenceSource: WebsiteEvidenceSource;
  evidence: string;
}

export type WebsiteEvidenceSource =
  | "quickbooks_invoice"
  | "quickbooks_sales_receipt"
  | "quickbooks_invoice_and_sales_receipt"
  | "wpengine_dedicated_server"
  | "wpengine_site_sibling"
  | "name_match"
  | "email_archive"
  | "manual";

export interface HostingEvidenceLine {
  description: string;
  transactionType: "invoice" | "sales_receipt";
}

const CONFIDENCE_RANK: Record<AssignmentSuggestion["confidence"], number> = { high: 3, medium: 2, low: 1 };

/**
 * Best-effort ownership suggestions for WP Engine installs, strongest first:
 * 1. A QBO hosting invoice line names the install's domain.
 * 2. The WP Engine account (physical server) is dedicated to one customer,
 *    e.g. account "da4sunstoppers" -> customer "Sun Stoppers Inc".
 * 3. Customer name and domain/install/site name share a compact identity.
 * 4. A sibling install in the same WP Engine site group already matched.
 * 5. Client correspondence in Mike's email archive names the site. This tier
 *    carries its own high/medium/low confidence and replaces an earlier
 *    suggestion only when it outranks it; on equal confidence the live
 *    QBO/WPE-derived suggestion wins.
 * Final calls stay human: suggestions are only persisted when accepted in the UI.
 */
export function suggestAssignments(
  installs: Array<{
    id: string;
    name: string | null;
    primaryDomain: string | null;
    siteName: string | null;
    accountId: string | null;
    accountName: string | null;
  }>,
  customerNames: string[],
  hostingDescriptionsByCustomer: Map<string, HostingEvidenceLine[]>,
): Map<string, AssignmentSuggestion> {
  const suggestions = new Map<string, AssignmentSuggestion>();

  const customers = customerNames
    .map(name => ({ name, compact: compactName(name) }))
    .filter(c => c.compact.length >= 5);

  // Dedicated-server accounts: strip the "da4"-style prefix and match the rest.
  const accountCustomer = new Map<string, { name: string; account: string }>();
  const accountKeys = new Set(installs.map(i => i.accountId).filter(Boolean) as string[]);
  for (const accountId of accountKeys) {
    const accountName = installs.find(i => i.accountId === accountId)?.accountName;
    if (!accountName) continue;
    const stripped = accountName.toLowerCase().replace(/^da\d+/, "").replace(/[^a-z0-9]/g, "");
    if (stripped.length < 5) continue;
    const owner = customers.find(c => c.compact.includes(stripped) || stripped.includes(c.compact));
    if (owner) accountCustomer.set(accountId, { name: owner.name, account: accountName });
  }

  for (const install of installs) {
    const domain = (install.primaryDomain || "").toLowerCase().replace(/^www\./, "");
    const bare = domain ? bareDomain(domain) : "";

    // 1. Invoice-line evidence.
    if (domain) {
      let found: { customer: string; lines: HostingEvidenceLine[] } | null = null;
      for (const [customer, lines] of hostingDescriptionsByCustomer) {
        const matches = lines.filter(({ description }) =>
          description.includes(domain) || (bare.length > 5 && description.replace(/[^a-z0-9]/g, "").includes(bare)),
        );
        if (matches.length > 0) {
          found = { customer, lines: matches };
          break;
        }
      }
      if (found) {
        const transactionTypes = new Set(found.lines.map(line => line.transactionType));
        const both = transactionTypes.size === 2;
        suggestions.set(install.id, {
          customerName: found.customer,
          confidence: "high",
          evidenceSource: both
            ? "quickbooks_invoice_and_sales_receipt"
            : transactionTypes.has("sales_receipt")
              ? "quickbooks_sales_receipt"
              : "quickbooks_invoice",
          evidence: both
            ? "Domain appears on QuickBooks invoice and sales receipt hosting lines"
            : transactionTypes.has("sales_receipt")
              ? "Domain appears on a QuickBooks sales receipt hosting line"
              : "Domain appears on a QuickBooks invoice hosting line",
        });
        continue;
      }
    }

    // 2. Dedicated server.
    const dedicated = install.accountId ? accountCustomer.get(install.accountId) : undefined;
    if (dedicated) {
      suggestions.set(install.id, {
        customerName: dedicated.name,
        confidence: "high",
        evidenceSource: "wpengine_dedicated_server",
        evidence: `Hosted on dedicated WP Engine server "${dedicated.account}"`,
      });
      continue;
    }

    // 3. Name identity between customer and domain/install/site name.
    const identities = [bare, compactName(install.name || ""), compactName(install.siteName || "")]
      .filter(v => v.length >= 5);
    const named = customers.find(c => identities.some(v => v.includes(c.compact) || c.compact.includes(v)));
    if (named) {
      suggestions.set(install.id, {
        customerName: named.name,
        confidence: "medium",
        evidenceSource: "name_match",
        evidence: "Customer name matches domain/install name",
      });
    }
  }

  // 4. Site-group sibling propagation.
  const siteCustomer = new Map<string, AssignmentSuggestion>();
  for (const install of installs) {
    const suggestion = suggestions.get(install.id);
    if (install.siteName && suggestion && !siteCustomer.has(install.siteName)) {
      siteCustomer.set(install.siteName, suggestion);
    }
  }
  for (const install of installs) {
    if (suggestions.has(install.id) || !install.siteName) continue;
    const sibling = siteCustomer.get(install.siteName);
    if (sibling) {
      suggestions.set(install.id, {
        customerName: sibling.customerName,
        confidence: "medium",
        evidenceSource: "wpengine_site_sibling",
        evidence: `Sibling install in WP Engine site group "${install.siteName}"`,
      });
    }
  }

  // 5. Email-archive evidence, keyed by install name. Where the mined client
  // name fuzzy-matches a live QBO customer, suggest the QBO spelling so
  // accepting the suggestion lines up with invoice matching downstream.
  for (const install of installs) {
    const match = install.name ? emailEvidenceByInstallName[install.name.toLowerCase()] : undefined;
    if (!match) continue;
    const existing = suggestions.get(install.id);
    if (existing && CONFIDENCE_RANK[existing.confidence] >= CONFIDENCE_RANK[match.confidence]) continue;
    const minedCompact = compactName(match.clientName);
    const qboCustomer = minedCompact.length >= 5
      ? customers.find(c => c.compact === minedCompact || c.compact.includes(minedCompact) || minedCompact.includes(c.compact))
      : undefined;
    suggestions.set(install.id, {
      customerName: qboCustomer?.name ?? match.clientName,
      confidence: match.confidence,
      evidenceSource: "email_archive",
      evidence: `Email archive: ${match.evidence}`,
    });
  }

  return suggestions;
}

router.get("/invoice-audit", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      throw AppError.tenantRequired("Tenant context required");
    }

    const thresholdDays = Math.min(365, Math.max(7, Number(req.query.thresholdDays) || 45));
    const windowMonths = Math.min(24, Math.max(1, Number(req.query.windowMonths) || 12));
    const includeAll = req.query.includeAll === "true";

    const windowStart = new Date();
    windowStart.setMonth(windowStart.getMonth() - windowMonths);
    const sinceDate = windowStart.toISOString().slice(0, 10);

    const allClients = await db
      .select({
        id: clients.id,
        companyName: clients.companyName,
        displayName: clients.displayName,
        legalName: clients.legalName,
        website: clients.website,
        email: clients.email,
        status: clients.status,
        tags: clients.tags,
      })
      .from(clients)
      .where(and(eq(clients.tenantId, tenantId), eq(clients.status, "active")));

    const taggedClients = allClients.filter(c => (c.tags || []).some(t => WPE_TAG_PATTERN.test(t)));
    const usingTaggedPopulation = !includeAll && taggedClients.length > 0;
    const population = usingTaggedPopulation ? taggedClients : allClients;

    let invoices: QuickBooksInvoiceSummary[] = [];
    let quickbooks: { connected: boolean; error?: string } = { connected: true };
    try {
      invoices = await tenantIntegrationService.fetchQuickBooksInvoices(tenantId, sinceDate);
    } catch (error) {
      quickbooks = {
        connected: false,
        error: error instanceof Error ? error.message : "QuickBooks fetch failed",
      };
    }

    // Group invoices by normalized customer name
    const byCustomer = new Map<string, { customerName: string; invoices: QuickBooksInvoiceSummary[] }>();
    for (const invoice of invoices) {
      if (!invoice.customerName) continue;
      const key = normalizeCompanyName(invoice.customerName);
      if (!key) continue;
      const entry = byCustomer.get(key) || { customerName: invoice.customerName, invoices: [] };
      entry.invoices.push(invoice);
      byCustomer.set(key, entry);
    }

    const matchedCustomerKeys = new Set<string>();
    const now = Date.now();

    const rows = population.map(client => {
      const candidateNames = [client.companyName, client.displayName, client.legalName]
        .filter((n): n is string => Boolean(n))
        .map(normalizeCompanyName)
        .filter(Boolean);

      let matched: { customerName: string; invoices: QuickBooksInvoiceSummary[] } | null = null;
      for (const name of candidateNames) {
        const entry = byCustomer.get(name);
        if (entry) {
          matched = entry;
          matchedCustomerKeys.add(name);
          break;
        }
      }

      const clientInvoices = matched?.invoices || [];
      const lastInvoice = clientInvoices.reduce<QuickBooksInvoiceSummary | null>(
        (latest, inv) => (!latest || inv.txnDate > latest.txnDate ? inv : latest),
        null,
      );
      const daysSinceLastInvoice = lastInvoice
        ? Math.max(0, Math.floor((now - Date.parse(lastInvoice.txnDate)) / 86_400_000))
        : null;
      const totalBilled = clientInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
      const openBalance = clientInvoices.reduce((sum, inv) => sum + inv.balance, 0);

      // Hosting-specific view: only invoice lines billed under a hosting item.
      let lastHostingDate: string | null = null;
      let lastHostingAmount = 0;
      let lastHostingDescription: string | null = null;
      let hostingBilled = 0;
      let hostingLineCount = 0;
      for (const inv of clientInvoices) {
        for (const line of inv.lines) {
          if (!line.itemName || !HOSTING_ITEM_PATTERN.test(line.itemName)) continue;
          hostingLineCount++;
          hostingBilled += line.amount;
          if (!lastHostingDate || inv.txnDate > lastHostingDate) {
            lastHostingDate = inv.txnDate;
            lastHostingAmount = line.amount;
            lastHostingDescription = line.description;
          }
        }
      }
      const daysSinceLastHosting = lastHostingDate
        ? Math.max(0, Math.floor((now - Date.parse(lastHostingDate)) / 86_400_000))
        : null;

      let status: AuditStatus;
      if (!quickbooks.connected) {
        status = "unmatched";
      } else if (!matched) {
        status = "unmatched";
      } else if (hostingLineCount === 0) {
        status = "never_billed";
      } else if (daysSinceLastHosting !== null && daysSinceLastHosting > thresholdDays) {
        status = "overdue";
      } else {
        status = "ok";
      }

      return {
        clientId: client.id,
        companyName: client.displayName || client.companyName,
        website: client.website,
        matchedCustomerName: matched?.customerName || null,
        status,
        lastHostingInvoiceDate: lastHostingDate,
        lastHostingAmount: lastHostingDate ? lastHostingAmount : null,
        lastHostingDescription,
        daysSinceLastHosting,
        hostingBilled: Math.round(hostingBilled * 100) / 100,
        lastInvoiceDate: lastInvoice?.txnDate || null,
        daysSinceLastInvoice,
        invoiceCount: clientInvoices.length,
        totalBilled: Math.round(totalBilled * 100) / 100,
        openBalance: Math.round(openBalance * 100) / 100,
      };
    });

    const severity: Record<AuditStatus, number> = { never_billed: 0, overdue: 1, unmatched: 2, ok: 3 };
    rows.sort((a, b) => {
      if (severity[a.status] !== severity[b.status]) {
        return severity[a.status] - severity[b.status];
      }
      const aDays = a.daysSinceLastHosting ?? Number.MAX_SAFE_INTEGER;
      const bDays = b.daysSinceLastHosting ?? Number.MAX_SAFE_INTEGER;
      if (aDays !== bDays) {
        return bDays - aDays;
      }
      return a.companyName.localeCompare(b.companyName);
    });

    // Cross-check against WP Engine: production installs whose domain shows no
    // billing evidence (no hosting line description mentions it and no audited
    // client's website carries it) are candidates for forgotten billing.
    let wpengine: {
      connected: boolean;
      error?: string;
      installCount?: number;
      productionCount?: number;
      assignedCount?: number;
      unbilledInstalls?: Array<{
        name: string | null;
        primaryDomain: string | null;
        siteName: string | null;
        accountName: string | null;
        assignedCustomer: string | null;
      }>;
    } = { connected: false };
    try {
      const installs: WPEngineInstallSummary[] = await tenantIntegrationService.listWPEngineInstalls(tenantId);
      const production = installs.filter(i => i.environment === "production" && i.status !== "inactive");

      const assignments = await db
        .select()
        .from(financeWebsiteAssignments)
        .where(eq(financeWebsiteAssignments.tenantId, tenantId));
      const assignedCustomerByInstall = new Map(assignments.map(a => [a.wpeInstallId, a.customerName]));

      const evidence: string[] = [];
      const hostedCustomers = new Set<string>();
      for (const inv of invoices) {
        for (const line of inv.lines) {
          if (line.itemName && HOSTING_ITEM_PATTERN.test(line.itemName)) {
            if (line.description) evidence.push(line.description.toLowerCase());
            if (inv.customerName) hostedCustomers.add(compactName(inv.customerName));
          }
        }
      }
      for (const client of allClients) {
        if (client.website) evidence.push(client.website.toLowerCase());
      }
      const evidenceBlob = evidence.join("\n");

      const unbilled = production.filter(install => {
        // An install assigned to a customer who is being billed hosting is
        // accounted for, even when the invoice line doesn't name its domain
        // (consolidated multi-site bills).
        const assignedCustomer = assignedCustomerByInstall.get(install.id);
        if (assignedCustomer && hostedCustomers.has(compactName(assignedCustomer))) return false;

        const domain = (install.primaryDomain || "").toLowerCase().replace(/^www\./, "");
        if (!domain) return true;
        // Bare-name fallback catches "SealandContractors.com" style mentions
        // that differ from the install's primary domain only by punctuation.
        const bareName = domain.replace(/\.(com|org|net|us|co|io)$/, "");
        return !evidenceBlob.includes(domain) && !(bareName.length > 5 && evidenceBlob.includes(bareName));
      });

      wpengine = {
        connected: true,
        installCount: installs.length,
        productionCount: production.length,
        assignedCount: production.filter(i => assignedCustomerByInstall.has(i.id)).length,
        unbilledInstalls: unbilled
          .map(i => ({
            name: i.name,
            primaryDomain: i.primaryDomain,
            siteName: i.siteName,
            accountName: i.accountName,
            assignedCustomer: assignedCustomerByInstall.get(i.id) ?? null,
          }))
          .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
      };
    } catch (error) {
      wpengine = {
        connected: false,
        error: error instanceof Error ? error.message : "WP Engine fetch failed",
      };
    }

    // QBO customers with invoices in the window that matched no audited client —
    // usually a naming mismatch worth reconciling.
    const unmatchedCustomers = Array.from(byCustomer.entries())
      .filter(([key]) => !matchedCustomerKeys.has(key))
      .map(([, entry]) => ({
        customerName: entry.customerName,
        invoiceCount: entry.invoices.length,
        totalBilled: Math.round(entry.invoices.reduce((sum, inv) => sum + inv.totalAmount, 0) * 100) / 100,
      }))
      .sort((a, b) => b.totalBilled - a.totalBilled);

    res.json({
      generatedAt: new Date().toISOString(),
      windowStart: sinceDate,
      thresholdDays,
      windowMonths,
      usingTaggedPopulation,
      taggedClientCount: taggedClients.length,
      quickbooks,
      wpengine,
      clients: rows,
      unmatchedCustomers,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/finance/invoice-audit", req);
  }
});

/**
 * The review workbench: every production install with its saved assignment
 * (if any) and a computed suggestion for the human to accept or override.
 */
router.get("/website-assignments", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      throw AppError.tenantRequired("Tenant context required");
    }

    const windowMonths = Math.min(36, Math.max(1, Number(req.query.windowMonths) || 24));
    const windowStart = new Date();
    windowStart.setMonth(windowStart.getMonth() - windowMonths);
    const sinceDate = windowStart.toISOString().slice(0, 10);

    let installs: WPEngineInstallSummary[] = [];
    let wpengine: { connected: boolean; error?: string } = { connected: true };
    try {
      installs = await tenantIntegrationService.listWPEngineInstalls(tenantId);
    } catch (error) {
      wpengine = { connected: false, error: error instanceof Error ? error.message : "WP Engine fetch failed" };
    }
    const production = installs.filter(i => i.environment === "production" && i.status !== "inactive");

    let invoices: QuickBooksInvoiceSummary[] = [];
    let salesReceipts: QuickBooksSalesReceiptSummary[] = [];
    let quickbooks: { connected: boolean; error?: string } = { connected: true };
    try {
      invoices = await tenantIntegrationService.fetchQuickBooksInvoices(tenantId, sinceDate);
      salesReceipts = await tenantIntegrationService.fetchQuickBooksSalesReceipts(tenantId, sinceDate);
    } catch (error) {
      quickbooks = { connected: false, error: error instanceof Error ? error.message : "QuickBooks fetch failed" };
    }

    const customerNames = Array.from(new Set(
      [...invoices, ...salesReceipts].map(i => i.customerName).filter((n): n is string => Boolean(n)),
    ))
      .sort((a, b) => a.localeCompare(b));

    const hostingDescriptionsByCustomer = new Map<string, HostingEvidenceLine[]>();
    const customersWithHosting = new Set<string>();
    for (const invoice of invoices) {
      if (!invoice.customerName) continue;
      for (const line of invoice.lines) {
        if (!line.itemName || !HOSTING_ITEM_PATTERN.test(line.itemName)) continue;
        customersWithHosting.add(invoice.customerName);
        if (line.description) {
          const list = hostingDescriptionsByCustomer.get(invoice.customerName) || [];
          list.push({ description: line.description.toLowerCase(), transactionType: "invoice" });
          hostingDescriptionsByCustomer.set(invoice.customerName, list);
        }
      }
    }
    for (const receipt of salesReceipts) {
      if (!receipt.customerName) continue;
      for (const line of receipt.lines) {
        if (!line.itemName || !HOSTING_ITEM_PATTERN.test(line.itemName)) continue;
        customersWithHosting.add(receipt.customerName);
        if (line.description) {
          const list = hostingDescriptionsByCustomer.get(receipt.customerName) || [];
          list.push({ description: line.description.toLowerCase(), transactionType: "sales_receipt" });
          hostingDescriptionsByCustomer.set(receipt.customerName, list);
        }
      }
    }

    const suggestions = suggestAssignments(production, customerNames, hostingDescriptionsByCustomer);

    const assignments = await db
      .select()
      .from(financeWebsiteAssignments)
      .where(eq(financeWebsiteAssignments.tenantId, tenantId));
    const assignmentByInstall = new Map(assignments.map(a => [a.wpeInstallId, a]));

    const clientRows = await db
      .select({ id: clients.id, companyName: clients.companyName, displayName: clients.displayName })
      .from(clients)
      .where(and(eq(clients.tenantId, tenantId), eq(clients.status, "active")));

    const rows = production
      .map(install => {
        const assignment = assignmentByInstall.get(install.id) || null;
        const suggestion = suggestions.get(install.id) || null;
        const assignmentMatchesSuggestion = Boolean(
          assignment && suggestion && normalizeCompanyName(assignment.customerName) === normalizeCompanyName(suggestion.customerName),
        );
        return {
          id: install.id,
          name: install.name,
          primaryDomain: install.primaryDomain,
          siteName: install.siteName,
          accountName: install.accountName,
          assignment: assignment
            ? {
                customerName: assignment.customerName,
                clientId: assignment.clientId,
                source: assignment.source,
                notes: assignment.notes,
                evidenceSource: assignment.evidenceSource
                  || (assignmentMatchesSuggestion ? suggestion!.evidenceSource : "manual"),
                evidence: assignment.evidenceDetails
                  || assignment.notes
                  || (assignmentMatchesSuggestion ? suggestion!.evidence : null),
              }
            : null,
          suggestion,
        };
      })
      .sort((a, b) => (a.primaryDomain ?? a.name ?? "").localeCompare(b.primaryDomain ?? b.name ?? ""));

    res.json({
      generatedAt: new Date().toISOString(),
      windowMonths,
      quickbooks,
      wpengine,
      customers: customerNames,
      customersWithHosting: Array.from(customersWithHosting).sort((a, b) => a.localeCompare(b)),
      clients: clientRows
        .map(c => ({ id: c.id, name: c.displayName || c.companyName }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      installs: rows,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/finance/website-assignments", req);
  }
});

interface AssignmentInput {
  wpeInstallId: string;
  customerName: string;
  installName?: string | null;
  primaryDomain?: string | null;
  clientId?: string | null;
  notes?: string | null;
  evidenceSource?: WebsiteEvidenceSource | null;
  evidenceDetails?: string | null;
  source?: string;
}

function parseAssignmentInput(raw: any): AssignmentInput {
  const wpeInstallId = typeof raw?.wpeInstallId === "string" ? raw.wpeInstallId.trim() : "";
  const customerName = typeof raw?.customerName === "string" ? raw.customerName.trim() : "";
  if (!wpeInstallId || wpeInstallId.length > 100) {
    throw AppError.badRequest("wpeInstallId is required");
  }
  if (!customerName || customerName.length > 200) {
    throw AppError.badRequest("customerName is required (max 200 chars)");
  }
  const optionalText = (value: any, max: number) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
  const evidenceSources = new Set<WebsiteEvidenceSource>([
    "quickbooks_invoice",
    "quickbooks_sales_receipt",
    "quickbooks_invoice_and_sales_receipt",
    "wpengine_dedicated_server",
    "wpengine_site_sibling",
    "name_match",
    "email_archive",
    "manual",
  ]);
  const rawEvidenceSource = optionalText(raw?.evidenceSource, 100);
  return {
    wpeInstallId,
    customerName,
    installName: optionalText(raw?.installName, 200),
    primaryDomain: optionalText(raw?.primaryDomain, 300),
    clientId: optionalText(raw?.clientId, 100),
    notes: optionalText(raw?.notes, 2000),
    evidenceSource: rawEvidenceSource && evidenceSources.has(rawEvidenceSource as WebsiteEvidenceSource)
      ? rawEvidenceSource as WebsiteEvidenceSource
      : null,
    evidenceDetails: optionalText(raw?.evidenceDetails, 2000),
    source: raw?.source === "suggestion_accepted" ? "suggestion_accepted" : "manual",
  };
}

async function upsertAssignments(tenantId: string, userId: string | null, inputs: AssignmentInput[]) {
  // Link the client record when a matching one exists, so the audit page can
  // deep-link; the QBO customer name remains the source of truth.
  const clientRows = await db
    .select({ id: clients.id, companyName: clients.companyName, displayName: clients.displayName, legalName: clients.legalName })
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), eq(clients.status, "active")));
  const clientByName = new Map<string, string>();
  for (const client of clientRows) {
    for (const name of [client.companyName, client.displayName, client.legalName]) {
      if (name) clientByName.set(normalizeCompanyName(name), client.id);
    }
  }
  const validClientIds = new Set(clientRows.map(c => c.id));

  const saved = [];
  for (const input of inputs) {
    const clientId = input.clientId && validClientIds.has(input.clientId)
      ? input.clientId
      : clientByName.get(normalizeCompanyName(input.customerName)) || null;
    const [row] = await db
      .insert(financeWebsiteAssignments)
      .values({
        tenantId,
        wpeInstallId: input.wpeInstallId,
        installName: input.installName,
        primaryDomain: input.primaryDomain,
        customerName: input.customerName,
        clientId,
        source: input.source || "manual",
        notes: input.notes,
        evidenceSource: input.evidenceSource,
        evidenceDetails: input.evidenceDetails,
        assignedByUserId: userId,
      })
      .onConflictDoUpdate({
        target: [financeWebsiteAssignments.tenantId, financeWebsiteAssignments.wpeInstallId],
        set: {
          installName: input.installName,
          primaryDomain: input.primaryDomain,
          customerName: input.customerName,
          clientId,
          source: input.source || "manual",
          notes: input.notes,
          evidenceSource: input.evidenceSource,
          evidenceDetails: input.evidenceDetails,
          assignedByUserId: userId,
          updatedAt: new Date(),
        },
      })
      .returning();
    saved.push(row);
  }
  return saved;
}

router.put("/website-assignments/:installId", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      throw AppError.tenantRequired("Tenant context required");
    }
    const input = parseAssignmentInput({ ...req.body, wpeInstallId: req.params.installId });
    const [saved] = await upsertAssignments(tenantId, (req.user as any)?.id ?? null, [input]);
    res.json({ assignment: saved });
  } catch (error) {
    return handleRouteError(res, error, "PUT /api/v1/finance/website-assignments/:installId", req);
  }
});

router.post("/website-assignments/bulk", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      throw AppError.tenantRequired("Tenant context required");
    }
    const rawList = Array.isArray(req.body?.assignments) ? req.body.assignments : [];
    if (rawList.length === 0 || rawList.length > 500) {
      throw AppError.badRequest("assignments must contain 1-500 entries");
    }
    const inputs = rawList.map(parseAssignmentInput);
    const saved = await upsertAssignments(tenantId, (req.user as any)?.id ?? null, inputs);
    res.json({ savedCount: saved.length });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/v1/finance/website-assignments/bulk", req);
  }
});

router.delete("/website-assignments/:installId", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      throw AppError.tenantRequired("Tenant context required");
    }
    await db
      .delete(financeWebsiteAssignments)
      .where(and(
        eq(financeWebsiteAssignments.tenantId, tenantId),
        eq(financeWebsiteAssignments.wpeInstallId, req.params.installId),
      ));
    res.json({ deleted: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/v1/finance/website-assignments/:installId", req);
  }
});

export default router;
