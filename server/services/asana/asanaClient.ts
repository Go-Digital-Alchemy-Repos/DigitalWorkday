import { tenantIntegrationService, type AsanaSecretConfig } from "../tenantIntegrations";

const ASANA_API_BASE = "https://app.asana.com/api/1.0";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const REQUEST_INTERVAL_MS = 200;

export interface AsanaWorkspace {
  gid: string;
  name: string;
}

export interface AsanaProject {
  gid: string;
  name: string;
  notes?: string;
  color?: string;
  archived?: boolean;
  created_at?: string;
  modified_at?: string;
  due_date?: string;
  start_on?: string;
  current_status?: { text: string; color: string } | null;
  team?: { gid: string; name: string } | null;
  workspace?: { gid: string; name: string };
}

export interface AsanaSection {
  gid: string;
  name: string;
  created_at?: string;
}

export interface AsanaTask {
  gid: string;
  name: string;
  notes?: string;
  completed: boolean;
  completed_at?: string | null;
  created_at?: string;
  modified_at?: string;
  due_on?: string | null;
  start_on?: string | null;
  assignee?: { gid: string; name: string; email?: string } | null;
  memberships?: Array<{ project: { gid: string; name: string }; section?: { gid: string; name: string } }>;
  parent?: { gid: string; name: string } | null;
  num_subtasks?: number;
  custom_fields?: Array<{ gid: string; name: string; display_value: string | null; text_value?: string | null }>;
}

export interface AsanaUser {
  gid: string;
  name: string;
  email?: string;
}

interface AsanaApiResponse<T> {
  data: T;
  next_page?: { offset: string; path: string; uri: string } | null;
}

let lastRequestTime = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < REQUEST_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

async function asanaFetch<T>(token: string, path: string, params?: Record<string, string>): Promise<AsanaApiResponse<T>> {
  const url = new URL(`${ASANA_API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await throttle();

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (res.ok) {
      return await res.json() as AsanaApiResponse<T>;
    }

    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      const delayMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : BASE_DELAY_MS * Math.pow(2, attempt);
      console.log(`[asana] Rate limited, retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await new Promise(r => setTimeout(r, delayMs));
      continue;
    }

    if (res.status >= 500 && attempt < MAX_RETRIES) {
      const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
      console.log(`[asana] Server error ${res.status}, retrying in ${delayMs}ms`);
      await new Promise(r => setTimeout(r, delayMs));
      continue;
    }

    const body = await res.text();
    throw new Error(`Asana API error ${res.status}: ${body}`);
  }

  throw new Error("Asana API: max retries exceeded");
}

async function paginateAll<T>(token: string, path: string, params?: Record<string, string>, limit = 100): Promise<T[]> {
  const results: T[] = [];
  let offset: string | undefined;

  const mergedParams = { ...params, limit: String(limit) };

  while (true) {
    if (offset) mergedParams.offset = offset;
    const response = await asanaFetch<T[]>(token, path, mergedParams);
    results.push(...response.data);

    if (response.next_page?.offset) {
      offset = response.next_page.offset;
    } else {
      break;
    }
  }

  return results;
}

export class AsanaClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  static async fromTenant(tenantId: string): Promise<AsanaClient> {
    const secrets = await tenantIntegrationService.getDecryptedSecrets<AsanaSecretConfig>(tenantId, "asana");
    if (!secrets?.personalAccessToken) {
      throw new Error("Asana is not connected. Please add your Personal Access Token first.");
    }
    return new AsanaClient(secrets.personalAccessToken);
  }

  async testConnection(): Promise<{ ok: boolean; user?: AsanaUser; error?: string }> {
    try {
      const res = await asanaFetch<AsanaUser>(this.token, "/users/me", { opt_fields: "gid,name,email" });
      return { ok: true, user: res.data };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  async getWorkspaces(): Promise<AsanaWorkspace[]> {
    return paginateAll<AsanaWorkspace>(this.token, "/workspaces", { opt_fields: "gid,name" });
  }

  async getProjects(workspaceGid: string, includeArchived = false): Promise<AsanaProject[]> {
    const params: Record<string, string> = {
      workspace: workspaceGid,
      opt_fields: "gid,name,notes,color,archived,created_at,modified_at,due_date,start_on,current_status,team,team.name",
    };
    if (!includeArchived) {
      params.archived = "false";
    }
    return paginateAll<AsanaProject>(this.token, "/projects", params);
  }

  async getSections(projectGid: string): Promise<AsanaSection[]> {
    return paginateAll<AsanaSection>(this.token, `/projects/${projectGid}/sections`, {
      opt_fields: "gid,name,created_at",
    });
  }

  async getTasksForSection(sectionGid: string): Promise<AsanaTask[]> {
    return paginateAll<AsanaTask>(this.token, `/sections/${sectionGid}/tasks`, {
      opt_fields: "gid,name,notes,completed,completed_at,created_at,modified_at,due_on,start_on,assignee,assignee.name,assignee.email,memberships.project,memberships.section,parent,parent.name,num_subtasks,custom_fields,custom_fields.name,custom_fields.display_value,custom_fields.text_value",
    });
  }

  async getTasksForProject(projectGid: string): Promise<AsanaTask[]> {
    return paginateAll<AsanaTask>(this.token, `/projects/${projectGid}/tasks`, {
      opt_fields: "gid,name,notes,completed,completed_at,created_at,modified_at,due_on,start_on,assignee,assignee.name,assignee.email,memberships.project,memberships.section,parent,parent.name,num_subtasks,custom_fields,custom_fields.name,custom_fields.display_value,custom_fields.text_value",
    });
  }

  async getSubtasks(taskGid: string): Promise<AsanaTask[]> {
    return paginateAll<AsanaTask>(this.token, `/tasks/${taskGid}/subtasks`, {
      opt_fields: "gid,name,notes,completed,completed_at,created_at,modified_at,due_on,start_on,assignee,assignee.name,assignee.email,parent,parent.name",
    });
  }

  async getWorkspaceUsers(workspaceGid: string): Promise<AsanaUser[]> {
    return paginateAll<AsanaUser>(this.token, `/workspaces/${workspaceGid}/users`, {
      opt_fields: "gid,name,email",
    });
  }
}
