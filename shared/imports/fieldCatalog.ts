export type FieldType = "string" | "number" | "datetime" | "enum" | "boolean" | "email";

export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  description?: string;
  examples?: string[];
  aliases: string[];
  enumValues?: string[];
  isResolver?: boolean;
}

export type EntityType = "clients" | "projects" | "tasks" | "users" | "admins" | "time_entries";

export const ENTITY_LABELS: Record<EntityType, string> = {
  clients: "Clients",
  projects: "Projects",
  tasks: "Tasks",
  users: "Employees",
  admins: "Admins",
  time_entries: "Time Entries",
};

export const CLIENT_FIELDS: FieldDefinition[] = [
  { key: "companyName", label: "Company Name", type: "string", required: true, aliases: ["company_name", "company", "name", "client_name", "clientName", "client"], examples: ["Acme Corp"] },
  { key: "displayName", label: "Display Name", type: "string", required: false, aliases: ["display_name", "display", "short_name"], examples: ["Acme"] },
  { key: "industry", label: "Industry", type: "string", required: false, aliases: ["sector", "vertical"], examples: ["Technology"] },
  { key: "website", label: "Website", type: "string", required: false, aliases: ["url", "site", "web"], examples: ["https://acme.com"] },
  { key: "phone", label: "Phone", type: "string", required: false, aliases: ["telephone", "tel", "phone_number"], examples: ["+1-555-0100"] },
  { key: "email", label: "Email", type: "email", required: false, aliases: ["contact_email", "company_email"], examples: ["info@acme.com"] },
  { key: "status", label: "Status", type: "enum", required: false, aliases: ["client_status"], enumValues: ["active", "inactive", "lead", "prospect", "past", "on_hold"], examples: ["active"] },
  { key: "notes", label: "Notes", type: "string", required: false, aliases: ["note", "comments", "comment"], examples: ["Key client"] },
  { key: "parentClientName", label: "Parent Client", type: "string", required: false, aliases: ["parent_client", "parent_company", "parent", "parentClient", "parent_client_name", "parentClientName", "division_of", "divisionOf", "client_group", "clientGroup"], examples: ["Parent Corp"], isResolver: true },
  { key: "addressLine1", label: "Address Line 1", type: "string", required: false, aliases: ["address_line_1", "address", "street"], examples: ["123 Main St"] },
  { key: "addressLine2", label: "Address Line 2", type: "string", required: false, aliases: ["address_line_2", "suite", "apt"], examples: ["Suite 100"] },
  { key: "city", label: "City", type: "string", required: false, aliases: ["town"], examples: ["New York"] },
  { key: "state", label: "State", type: "string", required: false, aliases: ["province", "region"], examples: ["NY"] },
  { key: "postalCode", label: "Postal Code", type: "string", required: false, aliases: ["postal_code", "zip", "zip_code", "zipcode"], examples: ["10001"] },
  { key: "country", label: "Country", type: "string", required: false, aliases: ["nation"], examples: ["US"] },
];

export const PROJECT_FIELDS: FieldDefinition[] = [
  { key: "name", label: "Project Name", type: "string", required: true, aliases: ["project_name", "projectName", "project", "title"], examples: ["Website Redesign"] },
  { key: "clientName", label: "Client Name", type: "string", required: false, aliases: ["client_name", "client", "company", "companyName"], examples: ["Acme Corp"], isResolver: true },
  { key: "description", label: "Description", type: "string", required: false, aliases: ["desc", "details", "summary"], examples: ["Full website redesign project"] },
  { key: "status", label: "Status", type: "enum", required: false, aliases: ["project_status"], enumValues: ["active", "completed", "on_hold", "archived"], examples: ["active"] },
  { key: "color", label: "Color", type: "string", required: false, aliases: ["project_color"], examples: ["#3B82F6"] },
  { key: "budgetMinutes", label: "Budget (minutes)", type: "number", required: false, aliases: ["budget_minutes", "budget", "budgetHours"], examples: ["4800"] },
];

export const TASK_FIELDS: FieldDefinition[] = [
  { key: "title", label: "Task Title", type: "string", required: true, aliases: ["task_title", "taskTitle", "task", "name", "task_name"], examples: ["Design homepage mockup"] },
  { key: "projectName", label: "Project Name", type: "string", required: false, aliases: ["project_name", "project", "projectTitle"], examples: ["Website Redesign"], isResolver: true },
  { key: "description", label: "Description", type: "string", required: false, aliases: ["desc", "details", "notes"], examples: ["Create initial mockup designs"] },
  { key: "status", label: "Status", type: "enum", required: false, aliases: ["task_status"], enumValues: ["todo", "in_progress", "review", "done"], examples: ["todo"] },
  { key: "priority", label: "Priority", type: "enum", required: false, aliases: ["task_priority", "prio"], enumValues: ["low", "medium", "high", "urgent"], examples: ["medium"] },
  { key: "assigneeEmail", label: "Assignee Email", type: "email", required: false, aliases: ["assignee_email", "assignee", "assigned_to", "owner"], examples: ["john@company.com"], isResolver: true },
  { key: "dueDate", label: "Due Date", type: "datetime", required: false, aliases: ["due_date", "deadline", "due"], examples: ["2026-03-15"] },
  { key: "startDate", label: "Start Date", type: "datetime", required: false, aliases: ["start_date", "start"], examples: ["2026-03-01"] },
  { key: "estimateMinutes", label: "Estimate (minutes)", type: "number", required: false, aliases: ["estimate_minutes", "estimate", "estimateHours", "time_estimate"], examples: ["120"] },
  { key: "parentTaskTitle", label: "Parent Task Title", type: "string", required: false, aliases: ["parent_task", "parent", "parentTask", "subtask_of"], examples: ["Design Phase"], isResolver: true },
];

export const USER_FIELDS: FieldDefinition[] = [
  { key: "email", label: "Email", type: "email", required: true, aliases: ["user_email", "userEmail", "employee_email"], examples: ["john@company.com"] },
  { key: "firstName", label: "First Name", type: "string", required: false, aliases: ["first_name", "first", "given_name"], examples: ["John"] },
  { key: "lastName", label: "Last Name", type: "string", required: false, aliases: ["last_name", "last", "family_name", "surname"], examples: ["Doe"] },
  { key: "name", label: "Full Name", type: "string", required: false, aliases: ["full_name", "fullName", "display_name"], examples: ["John Doe"] },
  { key: "role", label: "Role", type: "enum", required: false, aliases: ["user_role", "employee_role"], enumValues: ["employee", "admin", "manager", "contractor"], examples: ["employee"] },
  { key: "isActive", label: "Is Active", type: "boolean", required: false, aliases: ["is_active", "active", "status", "enabled"], examples: ["true"] },
];

export const ADMIN_FIELDS: FieldDefinition[] = [
  { key: "email", label: "Email", type: "email", required: true, aliases: ["admin_email", "user_email", "userEmail"], examples: ["admin@company.com"] },
  { key: "firstName", label: "First Name", type: "string", required: false, aliases: ["first_name", "first", "given_name"], examples: ["Jane"] },
  { key: "lastName", label: "Last Name", type: "string", required: false, aliases: ["last_name", "last", "family_name", "surname"], examples: ["Smith"] },
  { key: "name", label: "Full Name", type: "string", required: false, aliases: ["full_name", "fullName", "display_name"], examples: ["Jane Smith"] },
];

export const TIME_ENTRY_FIELDS: FieldDefinition[] = [
  { key: "userEmail", label: "User Email", type: "email", required: true, aliases: ["user_email", "email", "user", "employee_email"], examples: ["john@company.com"], isResolver: true },
  { key: "startTime", label: "Start Time", type: "datetime", required: true, aliases: ["start_time", "start", "date", "startDate", "start_date", "entry_date"], examples: ["2026-01-28T09:00:00Z"] },
  { key: "endTime", label: "End Time", type: "datetime", required: false, aliases: ["end_time", "end", "endDate", "end_date"], examples: ["2026-01-28T17:00:00Z"] },
  { key: "durationHours", label: "Duration (hours)", type: "number", required: false, aliases: ["duration_hours", "hours", "billableHours", "billable_hours", "duration"], examples: ["8"] },
  { key: "description", label: "Description", type: "string", required: false, aliases: ["desc", "notes", "task", "work_description"], examples: ["Client meeting"] },
  { key: "scope", label: "Scope", type: "enum", required: false, aliases: ["billable_scope", "entry_scope", "billable"], enumValues: ["in_scope", "out_of_scope", "internal"], examples: ["in_scope"] },
  { key: "clientName", label: "Client Name", type: "string", required: false, aliases: ["client_name", "client", "company", "companyName"], examples: ["Acme Corp"], isResolver: true },
  { key: "projectName", label: "Project Name", type: "string", required: false, aliases: ["project_name", "project"], examples: ["Website Redesign"], isResolver: true },
  { key: "taskTitle", label: "Task Title", type: "string", required: false, aliases: ["task_title", "task", "taskName", "task_name"], examples: ["Design homepage"], isResolver: true },
  { key: "isManual", label: "Is Manual", type: "boolean", required: false, aliases: ["is_manual", "manual"], examples: ["true"] },
  { key: "firstName", label: "First Name", type: "string", required: false, aliases: ["first_name", "first", "given_name"], examples: ["John"] },
  { key: "lastName", label: "Last Name", type: "string", required: false, aliases: ["last_name", "last", "family_name", "surname"], examples: ["Doe"] },
  { key: "role", label: "Role", type: "enum", required: false, aliases: ["user_role", "employee_role"], enumValues: ["employee", "admin", "manager", "contractor"], examples: ["employee"] },
  { key: "parentClientName", label: "Parent Client", type: "string", required: false, aliases: ["parent_client", "parent_company", "parent", "parentClient", "parent_client_name", "parentClientName", "division_of", "divisionOf", "client_group", "clientGroup"], examples: ["Parent Corp"], isResolver: true },
];

export const ENTITY_FIELD_MAP: Record<EntityType, FieldDefinition[]> = {
  clients: CLIENT_FIELDS,
  projects: PROJECT_FIELDS,
  tasks: TASK_FIELDS,
  users: USER_FIELDS,
  admins: ADMIN_FIELDS,
  time_entries: TIME_ENTRY_FIELDS,
};

export interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
  transform?: "trim" | "lowercase" | "parseDate" | "parseNumber" | "parseBoolean" | "enumMap";
  staticValue?: string;
  enumMap?: Record<string, string>;
}

export interface ImportJobDTO {
  id: string;
  tenantId: string;
  entityType: EntityType;
  status: "draft" | "validated" | "running" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  fileName?: string;
  rowCount: number;
  columns: string[];
  sampleRows: Record<string, string>[];
  mapping: ColumnMapping[];
  validationSummary?: ValidationSummary;
  importSummary?: ImportSummary;
  autoCreateMissing?: boolean;
}

export interface MissingDependency {
  type: "client" | "user" | "project";
  name: string;
  referencedByRows: number[];
}

export interface ValidationSummary {
  wouldCreate: number;
  wouldUpdate: number;
  wouldSkip: number;
  wouldFail: number;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  missingDependencies: MissingDependency[];
  wouldFailWithoutAutoCreate: number;
}

export interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  durationMs: number;
  errors: ValidationError[];
}

export interface ValidationError {
  row: number;
  field?: string;
  code: string;
  message: string;
}

export interface ValidationWarning {
  row: number;
  field?: string;
  code: string;
  message: string;
}

export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_-]+/g, "").replace(/[^a-z0-9]/g, "");
}

export function suggestMappings(
  sourceColumns: string[],
  fields: FieldDefinition[]
): ColumnMapping[] {
  const mappings: ColumnMapping[] = [];
  const usedColumns = new Set<string>();

  for (const field of fields) {
    const normalizedFieldKey = normalizeHeader(field.key);
    const allNames = [field.key, field.label, ...field.aliases];
    const normalizedNames = allNames.map(normalizeHeader);

    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const col of sourceColumns) {
      if (usedColumns.has(col)) continue;
      const normalizedCol = normalizeHeader(col);

      if (normalizedCol === normalizedFieldKey) {
        bestMatch = col;
        bestScore = 100;
        break;
      }

      for (const name of normalizedNames) {
        if (normalizedCol === name) {
          bestMatch = col;
          bestScore = 90;
          break;
        }
      }

      if (bestScore < 90) {
        for (const name of normalizedNames) {
          if (normalizedCol.includes(name) || name.includes(normalizedCol)) {
            if (bestScore < 70) {
              bestMatch = col;
              bestScore = 70;
            }
          }
        }
      }
    }

    if (bestMatch && bestScore >= 50) {
      usedColumns.add(bestMatch);
      let transform: ColumnMapping["transform"] | undefined;
      if (field.type === "email") transform = "lowercase";
      else if (field.type === "datetime") transform = "parseDate";
      else if (field.type === "number") transform = "parseNumber";
      else if (field.type === "boolean") transform = "parseBoolean";

      mappings.push({
        sourceColumn: bestMatch,
        targetField: field.key,
        transform,
      });
    }
  }

  return mappings;
}
