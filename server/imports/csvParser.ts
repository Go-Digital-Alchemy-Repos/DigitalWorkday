export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  rawRowCount: number;
}

export function parseCsv(text: string, maxRows = 50000): ParsedCsv {
  const lines = splitCsvLines(text);
  if (lines.length === 0) {
    return { headers: [], rows: [], rawRowCount: 0 };
  }

  const headers = parseCsvLine(lines[0]).map(h => h.trim());
  const rows: Record<string, string>[] = [];

  const limit = Math.min(lines.length, maxRows + 1);
  for (let i = 1; i < limit; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.every(v => v.trim() === "")) continue;

    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] || "").trim();
    }
    rows.push(row);
  }

  return { headers, rows, rawRowCount: lines.length - 1 };
}

function splitCsvLines(text: string): string[] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
        current += ch;
      }
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (current.trim() !== "") {
        lines.push(current);
      }
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim() !== "") {
    lines.push(current);
  }

  return lines;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  values.push(current);
  return values;
}
