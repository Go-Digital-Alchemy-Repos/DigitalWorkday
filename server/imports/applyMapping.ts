import { ColumnMapping } from "../../shared/imports/fieldCatalog";

export function applyMapping(
  row: Record<string, string>,
  mappings: ColumnMapping[]
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const mapping of mappings) {
    let value: string;

    if (mapping.staticValue !== undefined && mapping.staticValue !== "") {
      value = mapping.staticValue;
    } else {
      value = row[mapping.sourceColumn] || "";
    }

    if (mapping.transform) {
      value = applyTransform(value, mapping.transform, mapping.enumMap);
    }

    result[mapping.targetField] = value;
  }

  return result;
}

function applyTransform(
  value: string,
  transform: ColumnMapping["transform"],
  enumMap?: Record<string, string>
): string {
  if (!value) return value;

  switch (transform) {
    case "trim":
      return value.trim();
    case "lowercase":
      return value.trim().toLowerCase();
    case "parseDate":
      return parseDateValue(value);
    case "parseNumber":
      return parseNumberValue(value);
    case "parseBoolean":
      return parseBooleanValue(value);
    case "enumMap":
      if (enumMap) {
        const lower = value.trim().toLowerCase();
        return enumMap[lower] || enumMap[value.trim()] || value.trim();
      }
      return value.trim();
    default:
      return value.trim();
  }
}

function parseDateValue(value: string): string {
  const trimmed = value.trim();
  const isoMatch = trimmed.match(/(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/);
  if (isoMatch) {
    const d = new Date(isoMatch[1]);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) return d.toISOString();

  return trimmed;
}

function parseNumberValue(value: string): string {
  const trimmed = value.trim().replace(/,/g, "");
  const num = parseFloat(trimmed);
  if (!isNaN(num)) return String(num);
  return trimmed;
}

function parseBooleanValue(value: string): string {
  const lower = value.trim().toLowerCase();
  if (["true", "yes", "1", "y", "on"].includes(lower)) return "true";
  if (["false", "no", "0", "n", "off", ""].includes(lower)) return "false";
  return lower;
}
