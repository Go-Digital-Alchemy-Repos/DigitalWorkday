const R2_PUBLIC_URL_PATTERN = /^https?:\/\/pub-[a-f0-9]+\.r2\.dev\//;
const R2_STORAGE_PATTERN = /^https?:\/\/[a-f0-9]+\.r2\.cloudflarestorage\.com\//;

const KNOWN_KEY_PREFIXES = ["tenants/", "system/", "global/"];

function extractKeyFromR2Url(url: string): string | null {
  for (const prefix of KNOWN_KEY_PREFIXES) {
    const idx = url.indexOf("/" + prefix);
    if (idx !== -1) {
      return url.slice(idx + 1);
    }
  }
  return null;
}

export function getStorageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;

  if (url.startsWith("/api/v1/files/serve/")) {
    return url;
  }

  if (R2_PUBLIC_URL_PATTERN.test(url) || R2_STORAGE_PATTERN.test(url)) {
    const key = extractKeyFromR2Url(url);
    if (key) {
      return `/api/v1/files/serve/${encodeURI(key)}`;
    }
  }

  return url;
}
