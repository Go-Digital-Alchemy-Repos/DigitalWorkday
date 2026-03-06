import { db } from "../../db";
import { clients } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { listQuickBooksCustomers, type QBOCustomerDTO } from "./quickbooksCustomerService";
import { getClientMapping } from "./customerMappingService";

export interface MappingSuggestion {
  quickbooksCustomerId: string;
  displayName: string;
  confidence: number;
  reasons: string[];
  matchedFields: {
    name: boolean;
    email: boolean;
    phone: boolean;
  };
}

function normalize(str: string | null | undefined): string {
  if (!str) return "";
  return str.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function normalizePhone(str: string | null | undefined): string {
  if (!str) return "";
  return str.replace(/[^0-9]/g, "");
}

function stringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1.0;
  if (na.length === 0 || nb.length === 0) return 0;

  const longer = na.length > nb.length ? na : nb;
  const shorter = na.length > nb.length ? nb : na;

  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }

  let matches = 0;
  const maxLen = Math.max(na.length, nb.length);
  for (let i = 0; i < Math.min(na.length, nb.length); i++) {
    if (na[i] === nb[i]) matches++;
  }
  return matches / maxLen;
}

export async function getSuggestedQuickBooksMatches(
  tenantId: string,
  clientId: string
): Promise<MappingSuggestion[]> {
  const mapping = await getClientMapping(tenantId, clientId);
  if (mapping?.isLocked && mapping?.mappingStatus === "mapped") {
    return [];
  }

  const [client] = await db.select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId)))
    .limit(1);

  if (!client) return [];

  const { customers } = await listQuickBooksCustomers(tenantId, { limit: 100 });
  if (customers.length === 0) return [];

  const suggestions: MappingSuggestion[] = [];

  for (const qbCustomer of customers) {
    let score = 0;
    const reasons: string[] = [];
    const matchedFields = { name: false, email: false, phone: false };

    const nameNormLocal = normalize(client.companyName);
    const nameNormQb = normalize(qbCustomer.displayName);
    const companyNormQb = normalize(qbCustomer.companyName);

    if (nameNormLocal && nameNormQb && nameNormLocal === nameNormQb) {
      score += 0.45;
      reasons.push("Exact normalized name match");
      matchedFields.name = true;
    } else if (nameNormLocal && companyNormQb && nameNormLocal === companyNormQb) {
      score += 0.40;
      reasons.push("Exact company name match");
      matchedFields.name = true;
    } else {
      const sim = Math.max(
        stringSimilarity(client.companyName, qbCustomer.displayName),
        stringSimilarity(client.companyName, qbCustomer.companyName || "")
      );
      if (sim >= 0.7) {
        score += sim * 0.35;
        reasons.push(`Strong name similarity (${Math.round(sim * 100)}%)`);
        matchedFields.name = true;
      }
    }

    if (client.email && qbCustomer.primaryEmail) {
      if (normalize(client.email) === normalize(qbCustomer.primaryEmail)) {
        score += 0.30;
        reasons.push("Email match");
        matchedFields.email = true;
      }
    }

    if (client.phone && qbCustomer.primaryPhone) {
      if (normalizePhone(client.phone) === normalizePhone(qbCustomer.primaryPhone)) {
        score += 0.15;
        reasons.push("Phone match");
        matchedFields.phone = true;
      }
    }

    if (!qbCustomer.active) {
      score *= 0.5;
      reasons.push("Inactive in QuickBooks (confidence reduced)");
    }

    if (score >= 0.15) {
      suggestions.push({
        quickbooksCustomerId: qbCustomer.id,
        displayName: qbCustomer.displayName,
        confidence: Math.min(score, 1.0),
        reasons,
        matchedFields,
      });
    }
  }

  suggestions.sort((a, b) => b.confidence - a.confidence);
  return suggestions.slice(0, 10);
}
