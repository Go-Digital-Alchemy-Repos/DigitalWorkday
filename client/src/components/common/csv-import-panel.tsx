import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { 
  Upload, 
  FileSpreadsheet, 
  X, 
  Download, 
  CheckCircle, 
  AlertTriangle, 
  Copy,
  Loader2
} from "lucide-react";

export interface CsvColumn {
  key: string;
  label: string;
  required?: boolean;
  aliases?: string[];
}

export interface ParsedRow {
  [key: string]: string | undefined;
}

export interface ImportResult {
  name: string;
  status: "created" | "skipped" | "error";
  reason?: string;
  id?: string;
}

interface CsvImportPanelProps {
  title: string;
  description: string;
  columns: CsvColumn[];
  templateFilename: string;
  onImport: (rows: ParsedRow[], options: Record<string, boolean>) => Promise<{
    created: number;
    skipped: number;
    errors: number;
    results: ImportResult[];
  }>;
  isImporting?: boolean;
  options?: Array<{ key: string; label: string; defaultValue: boolean }>;
  nameField?: string;
}

export function CsvImportPanel({
  title,
  description,
  columns,
  templateFilename,
  onImport,
  isImporting = false,
  options = [],
  nameField = "name",
}: CsvImportPanelProps) {
  const { toast } = useToast();
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [optionValues, setOptionValues] = useState<Record<string, boolean>>(
    Object.fromEntries(options.map(o => [o.key, o.defaultValue]))
  );

  const requiredColumns = columns.filter(c => c.required);
  const optionalColumns = columns.filter(c => !c.required);

  const normalizeHeader = (header: string): string => {
    return header.trim().toLowerCase().replace(/[_\s-]+/g, "");
  };

  const findColumnIndex = (headers: string[], column: CsvColumn): number => {
    const normalizedTarget = normalizeHeader(column.key);
    const allAliases = [column.key, ...(column.aliases || [])].map(normalizeHeader);
    
    for (let i = 0; i < headers.length; i++) {
      const normalizedHeader = normalizeHeader(headers[i]);
      if (allAliases.includes(normalizedHeader)) {
        return i;
      }
    }
    return -1;
  };

  const parseCSV = (text: string): string[][] => {
    const lines: string[][] = [];
    let currentLine: string[] = [];
    let currentField = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          currentField += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          currentField += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          currentLine.push(currentField.trim());
          currentField = "";
        } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
          currentLine.push(currentField.trim());
          if (currentLine.some(field => field.length > 0)) {
            lines.push(currentLine);
          }
          currentLine = [];
          currentField = "";
          if (char === '\r') i++;
        } else if (char !== '\r') {
          currentField += char;
        }
      }
    }

    if (currentField || currentLine.length > 0) {
      currentLine.push(currentField.trim());
      if (currentLine.some(field => field.length > 0)) {
        lines.push(currentLine);
      }
    }

    return lines;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      let text = event.target?.result as string;
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      const lines = parseCSV(text);
      
      if (lines.length < 2) {
        toast({ 
          title: "Invalid CSV", 
          description: "CSV must have a header row and at least one data row", 
          variant: "destructive" 
        });
        return;
      }

      const headers = lines[0];
      const columnIndices: Record<string, number> = {};

      for (const col of columns) {
        const idx = findColumnIndex(headers, col);
        if (idx !== -1) {
          columnIndices[col.key] = idx;
        }
      }

      const missingRequired = requiredColumns.filter(c => columnIndices[c.key] === undefined);
      if (missingRequired.length > 0) {
        toast({ 
          title: "Missing required columns", 
          description: `Missing: ${missingRequired.map(c => c.label).join(", ")}`, 
          variant: "destructive" 
        });
        return;
      }

      const parsed: ParsedRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i];
        const row: ParsedRow = {};
        
        for (const col of columns) {
          const idx = columnIndices[col.key];
          if (idx !== undefined && idx < values.length) {
            const value = values[idx]?.trim().replace(/^["']|["']$/g, "");
            if (value) {
              row[col.key] = value;
            }
          }
        }

        const requiredValid = requiredColumns.every(c => row[c.key] && row[c.key]!.length > 0);
        if (requiredValid) {
          parsed.push(row);
        }
      }

      setParsedData(parsed);
      setImportResults([]);
      toast({ title: "CSV parsed", description: `${parsed.length} valid rows found` });
    };
    reader.readAsText(file);
  };

  const extractErrorMessage = (error: any): string => {
    const raw = error?.message || error?.body || "Unknown error";
    const statusPrefixMatch = raw.match(/^\d{3}:\s*(.*)/s);
    const bodyText = statusPrefixMatch ? statusPrefixMatch[1] : raw;
    try {
      const parsed = JSON.parse(bodyText);
      if (parsed.error) {
        if (parsed.details && Array.isArray(parsed.details)) {
          const detail = parsed.details[0];
          return `${parsed.error}: ${detail?.message || JSON.stringify(detail)}`;
        }
        return parsed.error;
      }
      if (parsed.message) return parsed.message;
    } catch {
    }
    return bodyText.length > 200 ? bodyText.slice(0, 200) + "..." : bodyText;
  };

  const handleImport = async () => {
    if (parsedData.length === 0) return;
    
    try {
      const result = await onImport(parsedData, optionValues);
      setImportResults(result.results);
      toast({ 
        title: "Import complete", 
        description: `Created: ${result.created}, Skipped: ${result.skipped}, Errors: ${result.errors}` 
      });
    } catch (error: any) {
      toast({ 
        title: "Import failed", 
        description: extractErrorMessage(error), 
        variant: "destructive" 
      });
    }
  };

  const downloadTemplate = () => {
    const header = columns.map(c => c.key).join(",");
    const exampleRow = columns.map(c => c.required ? `Example ${c.label}` : "").join(",");
    const content = `${header}\n${exampleRow}`;
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = templateFilename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyAllIds = () => {
    const ids = importResults
      .filter(r => r.status === "created" && r.id)
      .map(r => r.id)
      .join("\n");
    navigator.clipboard.writeText(ids);
    toast({ title: "Copied", description: "Created IDs copied to clipboard" });
  };

  const clearData = () => {
    setParsedData([]);
    setImportResults([]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="csv-upload">Upload CSV File</Label>
            <Button variant="outline" size="sm" onClick={downloadTemplate} data-testid="button-download-template">
              <Download className="h-4 w-4 mr-2" />
              Template
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              id="csv-upload"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="flex-1"
              data-testid="input-csv-upload"
            />
            {parsedData.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearData}
                data-testid="button-clear-csv"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Required: {requiredColumns.map(c => c.label).join(", ")}.
            {optionalColumns.length > 0 && ` Optional: ${optionalColumns.map(c => c.label).join(", ")}`}
          </p>
        </div>

        {parsedData.length > 0 && (
          <div className="space-y-3">
            <div className="border rounded-md max-h-48 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background border-b">
                  <tr>
                    {columns.slice(0, 4).map(col => (
                      <th key={col.key} className="text-left p-2">{col.label}</th>
                    ))}
                    {columns.length > 4 && <th className="text-left p-2">...</th>}
                  </tr>
                </thead>
                <tbody>
                  {parsedData.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {columns.slice(0, 4).map(col => (
                        <td key={col.key} className="p-2 truncate max-w-[150px]">
                          {row[col.key] || "-"}
                        </td>
                      ))}
                      {columns.length > 4 && <td className="p-2 text-muted-foreground">...</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedData.length > 10 && (
                <div className="p-2 text-center text-xs text-muted-foreground border-t">
                  ...and {parsedData.length - 10} more
                </div>
              )}
            </div>

            {options.length > 0 && (
              <div className="flex flex-wrap items-center gap-4">
                {options.map(opt => (
                  <label key={opt.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={optionValues[opt.key]}
                      onCheckedChange={(checked) => 
                        setOptionValues(prev => ({ ...prev, [opt.key]: !!checked }))
                      }
                      data-testid={`checkbox-${opt.key}`}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            )}

            <Button
              onClick={handleImport}
              disabled={isImporting}
              data-testid="button-import"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import {parsedData.length} Rows
                </>
              )}
            </Button>
          </div>
        )}

        {importResults.length > 0 && (
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Import Results</div>
              <Button size="sm" variant="outline" onClick={copyAllIds} data-testid="button-copy-all-ids">
                <Copy className="h-4 w-4 mr-2" />
                Copy IDs
              </Button>
            </div>
            <div className="border rounded-md max-h-48 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background border-b">
                  <tr>
                    <th className="text-left p-2">Name</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {importResults.map((result, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="p-2 text-xs truncate max-w-[200px]">{result.name}</td>
                      <td className="p-2">
                        {result.status === "created" && (
                          <Badge variant="default" className="bg-green-600 text-xs">Created</Badge>
                        )}
                        {result.status === "skipped" && (
                          <Badge variant="secondary" className="text-xs">Skipped</Badge>
                        )}
                        {result.status === "error" && (
                          <Badge variant="destructive" className="text-xs">Error</Badge>
                        )}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground truncate max-w-[200px]">
                        {result.reason || (result.id ? `ID: ${result.id.slice(0, 8)}...` : "")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
