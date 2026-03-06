import { getStoredTokens, refreshAccessToken, getBaseUrl } from "./quickbooksAuth";

interface QBORequestOptions {
  method?: string;
  path: string;
  body?: any;
  query?: Record<string, string>;
}

export async function qboRequest<T = any>(tenantId: string, options: QBORequestOptions): Promise<T> {
  let tokens = await getStoredTokens(tenantId);
  if (!tokens) throw new Error("No QuickBooks connection found for this tenant");

  if (tokens.expires_at < Date.now() + 60000) {
    tokens = await refreshAccessToken(tenantId);
  }

  const baseUrl = getBaseUrl();
  const url = new URL(`/v3/company/${tokens.realm_id}${options.path}`, baseUrl);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${tokens.access_token}`,
    "Accept": "application/json",
  };

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url.toString(), {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401) {
    tokens = await refreshAccessToken(tenantId);
    const retryResponse = await fetch(url.toString(), {
      method: options.method || "GET",
      headers: {
        ...headers,
        "Authorization": `Bearer ${tokens.access_token}`,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!retryResponse.ok) {
      const err = await retryResponse.text();
      throw new Error(`QuickBooks API error (${retryResponse.status}): ${err}`);
    }
    return retryResponse.json() as Promise<T>;
  }

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`QuickBooks API error (${response.status}): ${err}`);
  }

  return response.json() as Promise<T>;
}
