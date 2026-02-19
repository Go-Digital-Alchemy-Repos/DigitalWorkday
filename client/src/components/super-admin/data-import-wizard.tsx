import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  Download,
  Play,
  History,
  Columns,
  Eye,
  Wand2,
  Users,
  Briefcase,
  FolderKanban,
  ListTodo,
  Clock,
  Shield,
  X,
} from "lucide-react";
import {
  type EntityType,
  type FieldDefinition,
  type ColumnMapping,
  type ImportJobDTO,
  type ValidationSummary,
  type ImportSummary,
  type MissingDependency,
  ENTITY_LABELS,
  ENTITY_FIELD_MAP,
} from "../../../../shared/imports/fieldCatalog";

interface DataImportWizardProps {
  tenantId: string;
  tenantSlug: string;
  apiBasePath?: string;
}

type WizardStep = "type" | "upload" | "mapping" | "validate" | "execute" | "summary";

const ENTITY_ICONS: Record<EntityType, typeof Users> = {
  clients: Briefcase,
  projects: FolderKanban,
  tasks: ListTodo,
  users: Users,
  admins: Shield,
  time_entries: Clock,
};

const ENTITY_DESCRIPTIONS: Record<EntityType, string> = {
  clients: "Import client companies with their details",
  projects: "Import projects linked to existing clients",
  tasks: "Import tasks linked to existing projects",
  users: "Import employee accounts by email",
  admins: "Import admin accounts by email",
  time_entries: "Import time tracking entries for existing users",
};

function extractErrorMessage(error: any): string {
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
  return bodyText.length > 300 ? bodyText.slice(0, 300) + "..." : bodyText;
}

export function DataImportWizard({ tenantId, tenantSlug, apiBasePath }: DataImportWizardProps) {
  const basePath = apiBasePath || `/api/v1/super/tenants/${tenantId}`;
  const { toast } = useToast();
  const [step, setStep] = useState<WizardStep>("type");
  const [entityType, setEntityType] = useState<EntityType | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ImportJobDTO | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [uploadedColumns, setUploadedColumns] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<Record<string, string>[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [fields, setFields] = useState<FieldDefinition[]>([]);

  const [validationSummary, setValidationSummary] = useState<ValidationSummary | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [autoCreateMissing, setAutoCreateMissing] = useState(false);

  const reset = useCallback(() => {
    setStep("type");
    setEntityType(null);
    setJobId(null);
    setJob(null);
    setUploadedColumns([]);
    setSampleRows([]);
    setRowCount(0);
    setMapping([]);
    setFields([]);
    setValidationSummary(null);
    setImportSummary(null);
    setProgress(null);
    setAutoCreateMissing(false);
  }, []);

  const handleSelectType = async (type: EntityType) => {
    setEntityType(type);
    setIsLoading(true);
    try {
      const res = await apiRequest("POST", `${basePath}/import/jobs`, { entityType: type });
      const data = await res.json();
      setJobId(data.job.id);
      setJob(data.job);
      setFields(ENTITY_FIELD_MAP[type]);
      setStep("upload");
    } catch (err: any) {
      toast({ title: "Error", description: extractErrorMessage(err), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!jobId) return;
    setIsLoading(true);
    try {
      const csvText = await file.text();
      const res = await apiRequest("POST", `${basePath}/import/jobs/${jobId}/upload`, {
        csvText,
        fileName: file.name,
      });
      const data = await res.json();
      setUploadedColumns(data.columns);
      setSampleRows(data.sampleRows);
      setRowCount(data.rowCount);
      setMapping(data.suggestedMapping);
      setFields(data.fields);
      setStep("mapping");
    } catch (err: any) {
      if (isJobLostError(err)) {
        handleJobLost();
        return;
      }
      toast({ title: "Upload Failed", description: extractErrorMessage(err), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".csv") || file.type === "text/csv")) {
      handleFileUpload(file);
    } else {
      toast({ title: "Invalid File", description: "Please upload a CSV file", variant: "destructive" });
    }
  }, [jobId]);

  const handleUpdateMapping = (targetField: string, sourceColumn: string) => {
    setMapping(prev => {
      const filtered = prev.filter(m => m.targetField !== targetField);
      if (sourceColumn === "__none__") return filtered;
      const field = fields.find(f => f.key === targetField);
      let transform: ColumnMapping["transform"] | undefined;
      if (field?.type === "email") transform = "lowercase";
      else if (field?.type === "datetime") transform = "parseDate";
      else if (field?.type === "number") transform = "parseNumber";
      else if (field?.type === "boolean") transform = "parseBoolean";
      return [...filtered, { sourceColumn, targetField, transform }];
    });
  };

  const handleSaveMapping = async () => {
    if (!jobId) return;
    setIsLoading(true);
    try {
      await apiRequest("PUT", `${basePath}/import/jobs/${jobId}/mapping`, { mapping });
      setStep("validate");
      await handleValidate();
    } catch (err: any) {
      if (isJobLostError(err)) {
        handleJobLost();
        return;
      }
      toast({ title: "Error", description: extractErrorMessage(err), variant: "destructive" });
      setIsLoading(false);
    }
  };

  const isJobLostError = (err: any): boolean => {
    const msg = extractErrorMessage(err);
    return msg.toLowerCase().includes("job not found") || msg.toLowerCase().includes("not found");
  };

  const handleJobLost = () => {
    toast({
      title: "Import session expired",
      description: "The import session was lost (server may have restarted). Please start the import again.",
      variant: "destructive",
    });
    reset();
  };

  const handleValidate = async () => {
    if (!jobId) return;
    setIsLoading(true);
    try {
      const res = await apiRequest("POST", `${basePath}/import/jobs/${jobId}/validate`);
      const data = await res.json();
      setValidationSummary(data.summary);
    } catch (err: any) {
      if (isJobLostError(err)) {
        handleJobLost();
        return;
      }
      toast({ title: "Validation Failed", description: extractErrorMessage(err), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!jobId) return;
    setIsLoading(true);
    setStep("execute");
    setProgress({ processed: 0, total: rowCount });
    try {
      const res = await apiRequest("POST", `${basePath}/import/jobs/${jobId}/run`, { autoCreateMissing });
      const data = await res.json();
      setImportSummary(data.summary);
      setProgress({ processed: rowCount, total: rowCount });
      setStep("summary");

      queryClient.invalidateQueries({ queryKey: [`${basePath}/clients`] });
      queryClient.invalidateQueries({ queryKey: [`${basePath}/users`] });
      queryClient.invalidateQueries({ queryKey: [`${basePath}/projects`] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    } catch (err: any) {
      if (isJobLostError(err)) {
        handleJobLost();
        return;
      }
      toast({ title: "Import Failed", description: extractErrorMessage(err), variant: "destructive" });
      setStep("validate");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadErrors = () => {
    if (!jobId) return;
    window.open(`${basePath}/import/jobs/${jobId}/errors.csv`, "_blank");
  };

  if (showHistory) {
    return <ImportHistory tenantId={tenantId} apiBasePath={basePath} onClose={() => setShowHistory(false)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Wand2 className="h-4 w-4" />
            Data Import Wizard
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Import data from CSV files with column mapping and validation
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowHistory(true)} data-testid="button-import-history">
            <History className="h-4 w-4 mr-2" />
            Import History
          </Button>
          {step !== "type" && (
            <Button variant="outline" onClick={reset} data-testid="button-start-over">
              <X className="h-4 w-4 mr-2" />
              Start Over
            </Button>
          )}
        </div>
      </div>

      <StepIndicator currentStep={step} entityType={entityType} />

      {step === "type" && (
        <TypeSelectionStep onSelect={handleSelectType} isLoading={isLoading} />
      )}

      {step === "upload" && entityType && (
        <UploadStep
          entityType={entityType}
          onDrop={handleDrop}
          onFileSelect={handleFileUpload}
          isLoading={isLoading}
          onBack={() => { reset(); }}
        />
      )}

      {step === "mapping" && entityType && (
        <MappingStep
          entityType={entityType}
          fields={fields}
          columns={uploadedColumns}
          sampleRows={sampleRows}
          rowCount={rowCount}
          mapping={mapping}
          onUpdateMapping={handleUpdateMapping}
          onContinue={handleSaveMapping}
          onBack={() => setStep("upload")}
          isLoading={isLoading}
        />
      )}

      {step === "validate" && (
        <ValidationStep
          validationSummary={validationSummary}
          isLoading={isLoading}
          onExecute={handleExecute}
          onBack={() => setStep("mapping")}
          onRevalidate={handleValidate}
          autoCreateMissing={autoCreateMissing}
          onToggleAutoCreate={setAutoCreateMissing}
        />
      )}

      {step === "execute" && (
        <ExecutionStep progress={progress} rowCount={rowCount} />
      )}

      {step === "summary" && (
        <SummaryStep
          importSummary={importSummary}
          entityType={entityType}
          onDownloadErrors={handleDownloadErrors}
          onNewImport={reset}
        />
      )}
    </div>
  );
}

function StepIndicator({ currentStep, entityType }: { currentStep: WizardStep; entityType: EntityType | null }) {
  const steps = [
    { key: "type", label: "Select Type" },
    { key: "upload", label: "Upload File" },
    { key: "mapping", label: "Map Columns" },
    { key: "validate", label: "Validate" },
    { key: "execute", label: "Import" },
    { key: "summary", label: "Results" },
  ];

  const currentIndex = steps.findIndex(s => s.key === currentStep);

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {steps.map((s, i) => {
        const isActive = s.key === currentStep;
        const isPast = i < currentIndex;
        return (
          <div key={s.key} className="flex items-center gap-1 flex-shrink-0">
            {i > 0 && <div className={`w-4 h-px ${isPast ? "bg-primary" : "bg-border"}`} />}
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${
              isActive ? "bg-primary text-primary-foreground" :
              isPast ? "text-primary" : "text-muted-foreground"
            }`}>
              {isPast ? <CheckCircle className="h-3 w-3" /> : <span className="w-3 text-center">{i + 1}</span>}
              <span>{s.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TypeSelectionStep({ onSelect, isLoading }: { onSelect: (type: EntityType) => void; isLoading: boolean }) {
  const entities: EntityType[] = ["users", "admins", "clients", "projects", "tasks", "time_entries"];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Select Import Type</CardTitle>
        <CardDescription>Choose the type of data you want to import. Recommended order: Users, Clients, Projects, Tasks, Time Entries</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {entities.map(type => {
            const Icon = ENTITY_ICONS[type];
            return (
              <Button
                key={type}
                variant="outline"
                className="h-auto p-4 flex flex-col items-start gap-2 text-left"
                onClick={() => onSelect(type)}
                disabled={isLoading}
                data-testid={`button-import-${type}`}
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span className="font-medium">{ENTITY_LABELS[type]}</span>
                </div>
                <span className="text-xs text-muted-foreground font-normal">{ENTITY_DESCRIPTIONS[type]}</span>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function UploadStep({
  entityType,
  onDrop,
  onFileSelect,
  isLoading,
  onBack,
}: {
  entityType: EntityType;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (file: File) => void;
  isLoading: boolean;
  onBack: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Upload CSV File - {ENTITY_LABELS[entityType]}
        </CardTitle>
        <CardDescription>
          Upload a CSV file with your {ENTITY_LABELS[entityType].toLowerCase()} data. Max 25MB, up to 50,000 rows.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={`border-2 border-dashed rounded-md p-8 text-center transition-colors ${
            isDragging ? "border-primary bg-primary/5" : "border-border"
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { setIsDragging(false); onDrop(e); }}
          data-testid="dropzone-csv-upload"
        >
          {isLoading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Processing file...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drag and drop a CSV file here, or click to browse
              </p>
              <label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onFileSelect(file);
                  }}
                  data-testid="input-csv-file"
                />
                <Button variant="outline" asChild>
                  <span>Browse Files</span>
                </Button>
              </label>
            </div>
          )}
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack} data-testid="button-back-to-type">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MappingStep({
  entityType,
  fields,
  columns,
  sampleRows,
  rowCount,
  mapping,
  onUpdateMapping,
  onContinue,
  onBack,
  isLoading,
}: {
  entityType: EntityType;
  fields: FieldDefinition[];
  columns: string[];
  sampleRows: Record<string, string>[];
  rowCount: number;
  mapping: ColumnMapping[];
  onUpdateMapping: (targetField: string, sourceColumn: string) => void;
  onContinue: () => void;
  onBack: () => void;
  isLoading: boolean;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const mappedSource = (targetField: string) => {
    const m = mapping.find(m => m.targetField === targetField);
    return m?.sourceColumn || "__none__";
  };

  const requiredFields = fields.filter(f => f.required);
  const optionalFields = fields.filter(f => !f.required);
  const allRequiredMapped = requiredFields.every(f => mapping.some(m => m.targetField === f.key));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <Columns className="h-4 w-4" />
                Column Mapping - {ENTITY_LABELS[entityType]}
              </CardTitle>
              <CardDescription>{rowCount} rows detected. Map CSV columns to system fields.</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
              data-testid="button-toggle-preview"
            >
              <Eye className="h-4 w-4 mr-2" />
              {showPreview ? "Hide Preview" : "Preview Data"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showPreview && sampleRows.length > 0 && (
            <div className="overflow-x-auto border rounded-md mb-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left font-medium text-muted-foreground">#</th>
                    {columns.map(col => (
                      <th key={col} className="p-2 text-left font-medium text-muted-foreground whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sampleRows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2 text-muted-foreground">{i + 1}</td>
                      {columns.map(col => (
                        <td key={col} className="p-2 max-w-[200px] truncate">{row[col] || ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Required Fields</h4>
            {requiredFields.map(field => (
              <MappingRow
                key={field.key}
                field={field}
                columns={columns}
                selectedColumn={mappedSource(field.key)}
                onSelect={(col) => onUpdateMapping(field.key, col)}
                sampleRows={sampleRows}
              />
            ))}

            {optionalFields.length > 0 && (
              <>
                <Separator />
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Optional Fields</h4>
                {optionalFields.map(field => (
                  <MappingRow
                    key={field.key}
                    field={field}
                    columns={columns}
                    selectedColumn={mappedSource(field.key)}
                    onSelect={(col) => onUpdateMapping(field.key, col)}
                    sampleRows={sampleRows}
                  />
                ))}
              </>
            )}
          </div>

          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={onBack} data-testid="button-back-to-upload">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button
              onClick={onContinue}
              disabled={!allRequiredMapped || isLoading}
              data-testid="button-validate"
            >
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
              Validate
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MappingRow({
  field,
  columns,
  selectedColumn,
  onSelect,
  sampleRows,
}: {
  field: FieldDefinition;
  columns: string[];
  selectedColumn: string;
  onSelect: (col: string) => void;
  sampleRows: Record<string, string>[];
}) {
  const sampleValue = selectedColumn !== "__none__" && sampleRows[0] ? sampleRows[0][selectedColumn] : "";

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex-shrink-0 w-48">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">{field.label}</span>
          {field.required && <Badge variant="secondary" className="text-[10px] px-1 py-0">Required</Badge>}
        </div>
        <span className="text-[11px] text-muted-foreground">{field.type}{field.isResolver ? " (lookup)" : ""}</span>
      </div>
      <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-[180px]">
        <Select value={selectedColumn} onValueChange={onSelect}>
          <SelectTrigger className="h-8 text-sm" data-testid={`select-mapping-${field.key}`}>
            <SelectValue placeholder="Select column..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">-- Skip (no mapping) --</SelectItem>
            {columns.map(col => (
              <SelectItem key={col} value={col}>{col}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {sampleValue && (
        <span className="text-xs text-muted-foreground truncate max-w-[150px] flex-shrink-0" title={sampleValue}>
          e.g. "{sampleValue}"
        </span>
      )}
    </div>
  );
}

function ValidationStep({
  validationSummary,
  isLoading,
  onExecute,
  onBack,
  onRevalidate,
  autoCreateMissing,
  onToggleAutoCreate,
}: {
  validationSummary: ValidationSummary | null;
  isLoading: boolean;
  onExecute: () => void;
  onBack: () => void;
  onRevalidate: () => void;
  autoCreateMissing: boolean;
  onToggleAutoCreate: (value: boolean) => void;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-2">Validating data...</p>
        </CardContent>
      </Card>
    );
  }

  if (!validationSummary) return null;

  const hasMissingDeps = validationSummary.missingDependencies.length > 0;
  const hasErrors = validationSummary.wouldFail > 0;
  const canProceed = validationSummary.wouldCreate > 0 || validationSummary.wouldUpdate > 0;

  const missingByType = {
    client: validationSummary.missingDependencies.filter(d => d.type === "client"),
    user: validationSummary.missingDependencies.filter(d => d.type === "user"),
    project: validationSummary.missingDependencies.filter(d => d.type === "project"),
  };

  const DEP_TYPE_LABELS: Record<string, string> = { client: "Clients", user: "Users", project: "Projects" };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          {hasErrors && !hasMissingDeps ? <XCircle className="h-4 w-4 text-destructive" /> :
           hasMissingDeps ? <AlertTriangle className="h-4 w-4 text-yellow-500" /> :
           <CheckCircle className="h-4 w-4 text-green-500" />}
          Validation Results
        </CardTitle>
        <CardDescription>
          Review the validation results before importing
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Will Create" value={validationSummary.wouldCreate} variant="success" />
          <StatCard label="Will Update" value={validationSummary.wouldUpdate} variant="info" />
          <StatCard label="Will Skip" value={validationSummary.wouldSkip} variant="muted" />
          <StatCard label="Will Fail" value={validationSummary.wouldFail} variant="error" />
        </div>

        {hasMissingDeps && (
          <div className="space-y-3 border rounded-md p-3 bg-yellow-500/5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold">Missing Referenced Entities</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {validationSummary.wouldFailWithoutAutoCreate} row{validationSummary.wouldFailWithoutAutoCreate !== 1 ? "s" : ""} reference entities that don't exist yet. Enable auto-create to automatically create them during import.
                </p>
              </div>
            </div>

            {(["client", "user", "project"] as const).map(depType => {
              const deps = missingByType[depType];
              if (deps.length === 0) return null;
              const totalRows = deps.reduce((sum, d) => sum + d.referencedByRows.length, 0);
              return (
                <div key={depType} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{DEP_TYPE_LABELS[depType]}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {deps.length} missing, referenced by {totalRows} row{totalRows !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {deps.slice(0, 15).map(d => (
                      <Badge key={d.name} variant="secondary" className="text-[10px]" data-testid={`badge-missing-${depType}-${d.name}`}>
                        {d.name}
                        <span className="ml-1 opacity-60">({d.referencedByRows.length})</span>
                      </Badge>
                    ))}
                    {deps.length > 15 && (
                      <Badge variant="secondary" className="text-[10px]">
                        +{deps.length - 15} more
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}

            <Separator />

            <label className="flex items-center gap-3 cursor-pointer" data-testid="toggle-auto-create">
              <div
                role="switch"
                aria-checked={autoCreateMissing}
                onClick={() => onToggleAutoCreate(!autoCreateMissing)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ${autoCreateMissing ? "bg-primary" : "bg-muted-foreground/30"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoCreateMissing ? "translate-x-4" : "translate-x-0"}`} />
              </div>
              <div>
                <span className="text-sm font-medium">Auto-create missing entities</span>
                <p className="text-xs text-muted-foreground">
                  Automatically create {validationSummary.missingDependencies.length} missing {validationSummary.missingDependencies.length === 1 ? "entity" : "entities"} with default values during import
                </p>
              </div>
            </label>
          </div>
        )}

        {validationSummary.errors.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase">Errors (first 50)</h4>
            <div className="max-h-48 overflow-y-auto border rounded-md">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left">Row</th>
                    <th className="p-2 text-left">Field</th>
                    <th className="p-2 text-left">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {validationSummary.errors.slice(0, 50).map((e, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2">{e.row}</td>
                      <td className="p-2">{e.field || "-"}</td>
                      <td className="p-2">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {validationSummary.warnings.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase">Warnings</h4>
            <div className="max-h-32 overflow-y-auto border rounded-md">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left">Row</th>
                    <th className="p-2 text-left">Warning</th>
                  </tr>
                </thead>
                <tbody>
                  {validationSummary.warnings.slice(0, 30).map((w, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2">{w.row}</td>
                      <td className="p-2">{w.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-between pt-4 gap-2 flex-wrap">
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack} data-testid="button-back-to-mapping">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Mapping
            </Button>
            <Button variant="outline" onClick={onRevalidate} data-testid="button-revalidate">
              Re-validate
            </Button>
          </div>
          <Button
            onClick={onExecute}
            disabled={!canProceed || (hasMissingDeps && !autoCreateMissing)}
            data-testid="button-execute-import"
          >
            <Play className="h-4 w-4 mr-2" />
            {autoCreateMissing && hasMissingDeps ? "Execute Import (with auto-create)" : "Execute Import"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ExecutionStep({ progress, rowCount }: { progress: { processed: number; total: number } | null; rowCount: number }) {
  const pct = progress ? Math.round((progress.processed / progress.total) * 100) : 0;
  return (
    <Card>
      <CardContent className="p-8 text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="text-sm font-medium">Importing data...</p>
        <Progress value={pct} className="w-full max-w-md mx-auto" />
        <p className="text-xs text-muted-foreground">
          {progress ? `${progress.processed} / ${progress.total} rows` : "Starting..."}
        </p>
      </CardContent>
    </Card>
  );
}

function SummaryStep({
  importSummary,
  entityType,
  onDownloadErrors,
  onNewImport,
}: {
  importSummary: ImportSummary | null;
  entityType: EntityType | null;
  onDownloadErrors: () => void;
  onNewImport: () => void;
}) {
  if (!importSummary) return null;

  const hasErrors = importSummary.failed > 0;
  const durationSec = (importSummary.durationMs / 1000).toFixed(1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          {hasErrors ? <AlertTriangle className="h-4 w-4 text-yellow-500" /> : <CheckCircle className="h-4 w-4 text-green-500" />}
          Import Complete
        </CardTitle>
        <CardDescription>
          {entityType ? ENTITY_LABELS[entityType] : "Data"} import finished in {durationSec}s
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Created" value={importSummary.created} variant="success" />
          <StatCard label="Updated" value={importSummary.updated} variant="info" />
          <StatCard label="Skipped" value={importSummary.skipped} variant="muted" />
          <StatCard label="Failed" value={importSummary.failed} variant="error" />
        </div>

        {importSummary.errors.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase">Errors (first 20)</h4>
            <div className="max-h-40 overflow-y-auto border rounded-md">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left">Row</th>
                    <th className="p-2 text-left">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {importSummary.errors.slice(0, 20).map((e, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2">{e.row}</td>
                      <td className="p-2">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          {hasErrors && (
            <Button variant="outline" onClick={onDownloadErrors} data-testid="button-download-errors">
              <Download className="h-4 w-4 mr-2" />
              Download Error CSV
            </Button>
          )}
          <Button onClick={onNewImport} data-testid="button-new-import">
            <ArrowRight className="h-4 w-4 mr-2" />
            New Import
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, variant }: { label: string; value: number; variant: "success" | "error" | "info" | "muted" }) {
  const colorMap = {
    success: "text-green-600 dark:text-green-400",
    error: "text-red-600 dark:text-red-400",
    info: "text-blue-600 dark:text-blue-400",
    muted: "text-muted-foreground",
  };
  return (
    <div className="border rounded-md p-3 text-center">
      <p className={`text-xl font-bold ${colorMap[variant]}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ImportHistory({ tenantId, apiBasePath, onClose }: { tenantId: string; apiBasePath?: string; onClose: () => void }) {
  const basePath = apiBasePath || `/api/v1/super/tenants/${tenantId}`;
  const [jobs, setJobs] = useState<ImportJobDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useState(() => {
    (async () => {
      try {
        const res = await fetch(`${basePath}/import/jobs`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setJobs(data.jobs || []);
        }
      } catch (err) {
        console.error("Failed to load import history:", err);
      } finally {
        setIsLoading(false);
      }
    })();
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="h-4 w-4" />
            Import History
          </CardTitle>
          <Button variant="outline" size="sm" onClick={onClose} data-testid="button-close-history">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="p-4 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center p-4">No import jobs found for this session.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-left">Type</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">Rows</th>
                  <th className="p-2 text-left">Created</th>
                  <th className="p-2 text-left">Results</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(j => (
                  <tr key={j.id} className="border-b">
                    <td className="p-2">{ENTITY_LABELS[j.entityType]}</td>
                    <td className="p-2">
                      <Badge variant={j.status === "completed" ? "default" : j.status === "failed" ? "destructive" : "secondary"}>
                        {j.status}
                      </Badge>
                    </td>
                    <td className="p-2">{j.rowCount}</td>
                    <td className="p-2 text-xs text-muted-foreground">{new Date(j.createdAt).toLocaleString()}</td>
                    <td className="p-2 text-xs">
                      {j.importSummary ? (
                        <span>{j.importSummary.created} created, {j.importSummary.skipped} skipped, {j.importSummary.failed} failed</span>
                      ) : j.validationSummary ? (
                        <span>{j.validationSummary.wouldCreate} would create</span>
                      ) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
