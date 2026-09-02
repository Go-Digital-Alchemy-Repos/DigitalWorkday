/** @suite fast */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { externalFetch } from "../lib/fetchWithTimeout";
import { TenantIntegrationService } from "../services/tenantIntegrations";

vi.mock("../lib/fetchWithTimeout", () => ({
  externalFetch: vi.fn(),
}));

describe("QuickBooks sales receipt fetching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes sales receipt hosting lines for website evidence", async () => {
    const service = new TenantIntegrationService();
    vi.spyOn(service as any, "getQuickBooksAccessContext").mockResolvedValue({
      accessToken: "test-token",
      baseUrl: "https://quickbooks.example.test",
      realmId: "realm-1",
    });
    vi.mocked(externalFetch).mockResolvedValue(new Response(JSON.stringify({
      QueryResponse: {
        SalesReceipt: [{
          Id: "42",
          DocNumber: "SR-100",
          TxnDate: "2026-08-25",
          TotalAmt: 99,
          CustomerRef: { value: "7", name: "Example Customer" },
          Line: [{
            Amount: 99,
            Description: "Website hosting for example.com",
            SalesItemLineDetail: { ItemRef: { value: "3", name: "Website Hosting" } },
          }],
        }],
      },
    }), { status: 200 }));

    const receipts = await service.fetchQuickBooksSalesReceipts("tenant-1", "2026-01-01");

    expect(receipts).toEqual([{
      id: "42",
      docNumber: "SR-100",
      txnDate: "2026-08-25",
      totalAmount: 99,
      customerId: "7",
      customerName: "Example Customer",
      lines: [{
        itemId: "3",
        itemName: "Website Hosting",
        description: "Website hosting for example.com",
        amount: 99,
      }],
    }]);
    expect(vi.mocked(externalFetch).mock.calls[0][0]).toContain("SalesReceipt");
  });

  it("rejects an invalid lower-bound date before calling QuickBooks", async () => {
    const service = new TenantIntegrationService();

    await expect(service.fetchQuickBooksSalesReceipts("tenant-1", "08/25/2026"))
      .rejects.toThrow("Invalid sinceDate");
    expect(externalFetch).not.toHaveBeenCalled();
  });
});
