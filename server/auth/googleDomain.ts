export function getConfiguredGoogleAllowedDomains(
  raw = process.env.GOOGLE_ALLOWED_DOMAIN || process.env.GOOGLE_ALLOWED_DOMAINS || ""
): string[] {
  return raw
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function isGoogleEmailAllowed(email: string, allowedDomains = getConfiguredGoogleAllowedDomains()): boolean {
  if (allowedDomains.length === 0) return true;
  const domain = email.toLowerCase().split("@")[1] || "";
  return allowedDomains.includes(domain);
}
