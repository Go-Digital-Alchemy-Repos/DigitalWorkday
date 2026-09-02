/** @suite fast */
import { describe, expect, it } from "vitest";
import {
  suggestAssignments,
  type HostingEvidenceLine,
} from "../http/domains/financeAudit.router";

const baseInstall = {
  name: "example",
  primaryDomain: "example.com",
  siteName: null,
  accountId: null,
  accountName: null,
};

describe("finance website evidence sources", () => {
  it.each([
    {
      lines: [{ description: "hosting for example.com", transactionType: "invoice" }],
      source: "quickbooks_invoice",
    },
    {
      lines: [{ description: "hosting for example.com", transactionType: "sales_receipt" }],
      source: "quickbooks_sales_receipt",
    },
    {
      lines: [
        { description: "hosting for example.com", transactionType: "invoice" },
        { description: "hosting for example.com", transactionType: "sales_receipt" },
      ],
      source: "quickbooks_invoice_and_sales_receipt",
    },
  ] as Array<{ lines: HostingEvidenceLine[]; source: string }>)(
    "classifies matching QuickBooks hosting lines as $source",
    ({ lines, source }) => {
      const suggestions = suggestAssignments(
        [{ id: "install-1", ...baseInstall }],
        ["Example Customer"],
        new Map([["Example Customer", lines]]),
      );

      expect(suggestions.get("install-1")?.evidenceSource).toBe(source);
    },
  );
});
