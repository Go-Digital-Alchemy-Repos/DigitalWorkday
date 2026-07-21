const SECRET_PATTERNS = [
  /password["\s]*[:=]["\s]*[^\s,}"]*/gi,
  /api[_-]?key["\s]*[:=]["\s]*[^\s,}"]*/gi,
  /secret["\s]*[:=]["\s]*[^\s,}"]*/gi,
  /token["\s]*[:=]["\s]*[^\s,}"]*/gi,
  /bearer\s+[^\s,}"]*/gi,
  /authorization["\s]*[:=]["\s]*[^\s,}"]*/gi,
  /session[_-]?secret["\s]*[:=]["\s]*[^\s,}"]*/gi,
  /private[_-]?key["\s]*[:=]["\s]*[^\s,}"]*/gi,
  /database[_-]?url["\s]*[:=]["\s]*[^\s,}"]*/gi,
];

export function redactSecrets(input: string): string {
  let result = input;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

export function redactSecretsFromObject(obj: Record<string, unknown>): Record<string, unknown> {
  const secretKeys = [
    "password",
    "apiKey",
    "api_key",
    "secret",
    "token",
    "authorization",
    "sessionSecret",
    "session_secret",
    "privateKey",
    "private_key",
    "databaseUrl",
    "database_url",
  ];
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (secretKeys.some(sk => lowerKey.includes(sk.toLowerCase()))) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "string") {
      result[key] = redactSecrets(value);
    } else if (typeof value === "object" && value !== null) {
      result[key] = redactSecretsFromObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}
