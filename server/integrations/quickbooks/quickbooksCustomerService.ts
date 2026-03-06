import { qboRequest } from "./quickbooksClient";

export interface QBOCustomerDTO {
  id: string;
  displayName: string;
  companyName?: string;
  primaryEmail?: string;
  primaryPhone?: string;
  billingAddress?: string;
  active: boolean;
}

interface QBOCustomerRaw {
  Id: string;
  DisplayName?: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address?: string };
  PrimaryPhone?: { FreeFormNumber?: string };
  BillAddr?: {
    Line1?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
    Country?: string;
  };
  Active?: boolean;
}

function normalizeCustomer(raw: QBOCustomerRaw): QBOCustomerDTO {
  const addr = raw.BillAddr;
  const addressParts = [
    addr?.Line1,
    addr?.City,
    addr?.CountrySubDivisionCode,
    addr?.PostalCode,
    addr?.Country,
  ].filter(Boolean);

  return {
    id: raw.Id,
    displayName: raw.DisplayName || "",
    companyName: raw.CompanyName || undefined,
    primaryEmail: raw.PrimaryEmailAddr?.Address || undefined,
    primaryPhone: raw.PrimaryPhone?.FreeFormNumber || undefined,
    billingAddress: addressParts.length > 0 ? addressParts.join(", ") : undefined,
    active: raw.Active !== false,
  };
}

export async function listQuickBooksCustomers(
  tenantId: string,
  opts: { search?: string; limit?: number; offset?: number } = {}
): Promise<{ customers: QBOCustomerDTO[]; totalCount: number }> {
  const limit = Math.min(opts.limit || 50, 100);
  const offset = opts.offset || 0;

  let whereClause = "Active IN (true, false)";
  if (opts.search) {
    const escaped = opts.search.replace(/'/g, "\\'");
    whereClause = `DisplayName LIKE '%${escaped}%'`;
  }

  const countQuery = `SELECT COUNT(*) FROM Customer WHERE ${whereClause}`;
  const countResult = await qboRequest<any>(tenantId, {
    path: "/query",
    query: { query: countQuery },
  });
  const totalCount = countResult?.QueryResponse?.totalCount ?? 0;

  const dataQuery = `SELECT * FROM Customer WHERE ${whereClause} ORDERBY DisplayName STARTPOSITION ${offset + 1} MAXRESULTS ${limit}`;
  const result = await qboRequest<any>(tenantId, {
    path: "/query",
    query: { query: dataQuery },
  });

  const rawCustomers: QBOCustomerRaw[] = result?.QueryResponse?.Customer || [];
  return {
    customers: rawCustomers.map(normalizeCustomer),
    totalCount,
  };
}

export async function getQuickBooksCustomer(
  tenantId: string,
  quickbooksCustomerId: string
): Promise<QBOCustomerDTO | null> {
  try {
    const result = await qboRequest<any>(tenantId, {
      path: `/customer/${quickbooksCustomerId}`,
    });
    if (!result?.Customer) return null;
    return normalizeCustomer(result.Customer);
  } catch {
    return null;
  }
}

export async function createQuickBooksCustomerFromClient(
  tenantId: string,
  clientData: {
    companyName: string;
    displayName?: string;
    email?: string;
    phone?: string;
    addressLine1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  }
): Promise<QBOCustomerDTO> {
  const payload: any = {
    DisplayName: clientData.displayName || clientData.companyName,
    CompanyName: clientData.companyName,
  };

  if (clientData.email) {
    payload.PrimaryEmailAddr = { Address: clientData.email };
  }
  if (clientData.phone) {
    payload.PrimaryPhone = { FreeFormNumber: clientData.phone };
  }
  if (clientData.addressLine1) {
    payload.BillAddr = {
      Line1: clientData.addressLine1,
      City: clientData.city || "",
      CountrySubDivisionCode: clientData.state || "",
      PostalCode: clientData.postalCode || "",
      Country: clientData.country || "",
    };
  }

  const result = await qboRequest<any>(tenantId, {
    method: "POST",
    path: "/customer",
    body: payload,
  });

  return normalizeCustomer(result.Customer);
}

export async function updateQuickBooksCustomerFromClient(
  tenantId: string,
  quickbooksCustomerId: string,
  clientData: {
    companyName: string;
    displayName?: string;
    email?: string;
    phone?: string;
    addressLine1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  }
): Promise<QBOCustomerDTO> {
  const existing = await qboRequest<any>(tenantId, {
    path: `/customer/${quickbooksCustomerId}`,
  });

  if (!existing?.Customer) {
    throw new Error(`QuickBooks customer ${quickbooksCustomerId} not found`);
  }

  const payload: any = {
    ...existing.Customer,
    DisplayName: clientData.displayName || clientData.companyName,
    CompanyName: clientData.companyName,
    sparse: true,
  };

  if (clientData.email) {
    payload.PrimaryEmailAddr = { Address: clientData.email };
  }
  if (clientData.phone) {
    payload.PrimaryPhone = { FreeFormNumber: clientData.phone };
  }
  if (clientData.addressLine1) {
    payload.BillAddr = {
      Line1: clientData.addressLine1,
      City: clientData.city || "",
      CountrySubDivisionCode: clientData.state || "",
      PostalCode: clientData.postalCode || "",
      Country: clientData.country || "",
    };
  }

  const result = await qboRequest<any>(tenantId, {
    method: "POST",
    path: "/customer",
    body: payload,
  });

  return normalizeCustomer(result.Customer);
}
