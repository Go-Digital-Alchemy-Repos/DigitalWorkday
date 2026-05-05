import { buildHeaders } from "@/lib/queryClient";

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  const normalized: Record<string, string> = {};
  if (!headers) return normalized;

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      normalized[key] = value;
    });
    return normalized;
  }

  if (Array.isArray(headers)) {
    headers.forEach(([key, value]) => {
      normalized[key] = value;
    });
    return normalized;
  }

  return { ...headers };
}

export function fetchReport(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, {
    credentials: "include",
    ...init,
    headers: {
      ...buildHeaders(),
      ...normalizeHeaders(init.headers),
    },
  });
}
