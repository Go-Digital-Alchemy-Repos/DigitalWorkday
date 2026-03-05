import { db } from "../../db";
import { clients, projects, tasks, comments, users, teams } from "@shared/schema";
import { eq, and, or, ilike, sql, SQL } from "drizzle-orm";
import { config } from "../../config";
import { taskVisibilityFilter, projectVisibilityFilter } from "../../lib/privateVisibility";

export interface SearchResultItem {
  id: string;
  entityType: "client" | "project" | "task" | "user" | "team" | "comment";
  title: string;
  subtitle: string | null;
  route: string | null;
  meta: Record<string, unknown>;
  score: number;
}

export interface SearchResults {
  clients: SearchResultItem[];
  projects: SearchResultItem[];
  tasks: SearchResultItem[];
  users: SearchResultItem[];
  teams: SearchResultItem[];
  comments: SearchResultItem[];
  timing: {
    totalMs: number;
    perEntity: Record<string, number>;
  };
}

interface SearchParams {
  tenantId: string;
  userId: string;
  query: string;
  maxResults?: number;
  entityTypes?: string[];
}

const ENTITY_LIMITS = {
  clients: 10,
  projects: 10,
  tasks: 10,
  users: 5,
  teams: 5,
  comments: 10,
};

function likePattern(query: string): string {
  const escaped = query.replace(/[%_\\]/g, "\\$&");
  return `%${escaped}%`;
}

function prefixPattern(query: string): string {
  const escaped = query.replace(/[%_\\]/g, "\\$&");
  return `${escaped}%`;
}

async function searchClients(
  tenantId: string,
  query: string,
  limit: number
): Promise<SearchResultItem[]> {
  const pattern = likePattern(query);
  const prefix = prefixPattern(query);

  const rows = await db
    .select({
      id: clients.id,
      companyName: clients.companyName,
      status: clients.status,
      isPrefix: sql<boolean>`(LOWER(${clients.companyName}) LIKE LOWER(${prefix}))`.as("is_prefix"),
    })
    .from(clients)
    .where(
      and(
        eq(clients.tenantId, tenantId),
        ilike(clients.companyName, pattern)
      )
    )
    .orderBy(
      sql`CASE WHEN LOWER(${clients.companyName}) LIKE LOWER(${prefix}) THEN 0 ELSE 1 END`,
      clients.companyName
    )
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    entityType: "client" as const,
    title: r.companyName,
    subtitle: r.status || null,
    route: `/clients/${r.id}`,
    meta: { status: r.status },
    score: r.isPrefix ? 2 : 1,
  }));
}

async function searchProjects(
  tenantId: string,
  userId: string,
  query: string,
  limit: number
): Promise<SearchResultItem[]> {
  const pattern = likePattern(query);
  const prefix = prefixPattern(query);

  const visFilter = projectVisibilityFilter(userId, tenantId);
  const textMatch = or(
    ilike(projects.name, pattern),
    ilike(projects.description, pattern)
  )!;

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      description: projects.description,
      isNamePrefix: sql<boolean>`(LOWER(${projects.name}) LIKE LOWER(${prefix}))`.as("is_name_prefix"),
      isNameMatch: sql<boolean>`(LOWER(${projects.name}) LIKE LOWER(${pattern}))`.as("is_name_match"),
    })
    .from(projects)
    .where(and(eq(projects.tenantId, tenantId), textMatch, visFilter))
    .orderBy(
      sql`CASE WHEN LOWER(${projects.name}) LIKE LOWER(${prefix}) THEN 0 WHEN LOWER(${projects.name}) LIKE LOWER(${pattern}) THEN 1 ELSE 2 END`,
      projects.updatedAt
    )
    .limit(limit);

  return rows.map((r) => {
    let subtitle: string | null = null;
    if (!r.isNameMatch && r.description) {
      const desc = r.description.replace(/<[^>]*>/g, "");
      const idx = desc.toLowerCase().indexOf(query.toLowerCase());
      if (idx >= 0) {
        const start = Math.max(0, idx - 20);
        const end = Math.min(desc.length, idx + query.length + 40);
        subtitle = (start > 0 ? "..." : "") + desc.slice(start, end) + (end < desc.length ? "..." : "");
      }
    }
    return {
      id: r.id,
      entityType: "project" as const,
      title: r.name,
      subtitle: subtitle || r.status || null,
      route: `/projects/${r.id}`,
      meta: { status: r.status },
      score: r.isNamePrefix ? 3 : r.isNameMatch ? 2 : 1,
    };
  });
}

async function searchTasks(
  tenantId: string,
  userId: string,
  query: string,
  limit: number
): Promise<SearchResultItem[]> {
  const pattern = likePattern(query);
  const prefix = prefixPattern(query);

  const visFilter = taskVisibilityFilter(userId, tenantId);
  const textMatch = or(
    ilike(tasks.title, pattern),
    ilike(tasks.description, pattern)
  )!;

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      projectId: tasks.projectId,
      description: tasks.description,
      isTitlePrefix: sql<boolean>`(LOWER(${tasks.title}) LIKE LOWER(${prefix}))`.as("is_title_prefix"),
      isTitleMatch: sql<boolean>`(LOWER(${tasks.title}) LIKE LOWER(${pattern}))`.as("is_title_match"),
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.tenantId, tenantId),
        textMatch,
        visFilter
      )
    )
    .orderBy(
      sql`CASE WHEN LOWER(${tasks.title}) LIKE LOWER(${prefix}) THEN 0 WHEN LOWER(${tasks.title}) LIKE LOWER(${pattern}) THEN 1 ELSE 2 END`,
      tasks.updatedAt
    )
    .limit(limit);

  return rows.map((r) => {
    let subtitle: string | null = null;
    if (!r.isTitleMatch && r.description) {
      const desc = r.description.replace(/<[^>]*>/g, "");
      const idx = desc.toLowerCase().indexOf(query.toLowerCase());
      if (idx >= 0) {
        const start = Math.max(0, idx - 20);
        const end = Math.min(desc.length, idx + query.length + 40);
        subtitle = (start > 0 ? "..." : "") + desc.slice(start, end) + (end < desc.length ? "..." : "");
      }
    }
    return {
      id: r.id,
      entityType: "task" as const,
      title: r.title || "",
      subtitle,
      route: `/tasks?taskId=${r.id}`,
      meta: { status: r.status, projectId: r.projectId },
      score: r.isTitlePrefix ? 3 : r.isTitleMatch ? 2 : 1,
    };
  });
}

async function searchUsers(
  tenantId: string,
  query: string,
  limit: number
): Promise<SearchResultItem[]> {
  const pattern = likePattern(query);
  const prefix = prefixPattern(query);

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        or(
          ilike(users.name, pattern),
          ilike(users.email, pattern),
          ilike(users.firstName, pattern),
          ilike(users.lastName, pattern)
        )
      )
    )
    .orderBy(
      sql`CASE WHEN LOWER(${users.name}) LIKE LOWER(${prefix}) THEN 0 ELSE 1 END`,
      users.name
    )
    .limit(limit);

  return rows.map((r) => {
    const displayName = [r.firstName, r.lastName].filter(Boolean).join(" ") || r.name || r.email;
    return {
      id: r.id,
      entityType: "user" as const,
      title: displayName,
      subtitle: r.email,
      route: null,
      meta: { email: r.email, role: r.role },
      score: (r.name || "").toLowerCase().startsWith(query.toLowerCase()) ? 2 : 1,
    };
  });
}

async function searchTeams(
  tenantId: string,
  query: string,
  limit: number
): Promise<SearchResultItem[]> {
  const pattern = likePattern(query);
  const prefix = prefixPattern(query);

  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
    })
    .from(teams)
    .where(and(eq(teams.tenantId, tenantId), ilike(teams.name, pattern)))
    .orderBy(
      sql`CASE WHEN LOWER(${teams.name}) LIKE LOWER(${prefix}) THEN 0 ELSE 1 END`,
      teams.name
    )
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    entityType: "team" as const,
    title: r.name,
    subtitle: null,
    route: `/teams/${r.id}`,
    meta: {},
    score: r.name.toLowerCase().startsWith(query.toLowerCase()) ? 2 : 1,
  }));
}

async function searchComments(
  tenantId: string,
  userId: string,
  query: string,
  limit: number
): Promise<SearchResultItem[]> {
  const pattern = likePattern(query);

  const visFilter = config.features.enablePrivateTasks
    ? or(
        sql`${tasks.visibility} != 'private'`,
        eq(tasks.createdBy, userId),
        sql`EXISTS (SELECT 1 FROM task_access WHERE task_access.task_id = ${tasks.id} AND task_access.user_id = ${userId} AND task_access.tenant_id = ${tenantId})`
      )!
    : sql`true`;

  const projVisFilter = config.features.enablePrivateProjects
    ? or(
        sql`${projects.visibility} != 'private'`,
        eq(projects.createdBy, userId),
        sql`EXISTS (SELECT 1 FROM project_access WHERE project_access.project_id = ${projects.id} AND project_access.user_id = ${userId} AND project_access.tenant_id = ${tenantId})`
      )!
    : sql`true`;

  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      taskId: comments.taskId,
      projectId: tasks.projectId,
    })
    .from(comments)
    .innerJoin(tasks, eq(comments.taskId, tasks.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(
      and(
        eq(tasks.tenantId, tenantId),
        ilike(comments.body, pattern),
        visFilter,
        projVisFilter
      )
    )
    .orderBy(comments.createdAt)
    .limit(limit);

  return rows.map((r) => {
    const plainBody = (r.body || "").replace(/<[^>]*>/g, "");
    const idx = plainBody.toLowerCase().indexOf(query.toLowerCase());
    let snippet = plainBody.slice(0, 80);
    if (idx >= 0) {
      const start = Math.max(0, idx - 20);
      const end = Math.min(plainBody.length, idx + query.length + 60);
      snippet = (start > 0 ? "..." : "") + plainBody.slice(start, end) + (end < plainBody.length ? "..." : "");
    } else if (snippet.length >= 80) {
      snippet += "...";
    }
    return {
      id: r.id,
      entityType: "comment" as const,
      title: snippet,
      subtitle: null,
      route: r.taskId ? `/tasks?taskId=${r.taskId}` : null,
      meta: { taskId: r.taskId, projectId: r.projectId },
      score: 1,
    };
  });
}

export async function searchTenantEntities(params: SearchParams): Promise<SearchResults> {
  const { tenantId, userId, query, maxResults = 10 } = params;
  const q = query.trim();

  const empty: SearchResults = {
    clients: [], projects: [], tasks: [], users: [], teams: [], comments: [],
    timing: { totalMs: 0, perEntity: {} },
  };

  if (!q || q.length < 2) return empty;

  const shouldSearch = (type: string) =>
    !params.entityTypes || params.entityTypes.includes(type);

  const start = performance.now();
  const timings: Record<string, number> = {};

  const timed = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const t0 = performance.now();
    const result = await fn();
    timings[name] = Math.round(performance.now() - t0);
    return result;
  };

  const [clientResults, projectResults, taskResults, userResults, teamResults, commentResults] =
    await Promise.all([
      shouldSearch("clients")
        ? timed("clients", () => searchClients(tenantId, q, Math.min(maxResults, ENTITY_LIMITS.clients)))
        : Promise.resolve([]),
      shouldSearch("projects")
        ? timed("projects", () => searchProjects(tenantId, userId, q, Math.min(maxResults, ENTITY_LIMITS.projects)))
        : Promise.resolve([]),
      shouldSearch("tasks")
        ? timed("tasks", () => searchTasks(tenantId, userId, q, Math.min(maxResults, ENTITY_LIMITS.tasks)))
        : Promise.resolve([]),
      shouldSearch("users")
        ? timed("users", () => searchUsers(tenantId, q, Math.min(maxResults, ENTITY_LIMITS.users)))
        : Promise.resolve([]),
      shouldSearch("teams")
        ? timed("teams", () => searchTeams(tenantId, q, Math.min(maxResults, ENTITY_LIMITS.teams)))
        : Promise.resolve([]),
      shouldSearch("comments")
        ? timed("comments", () => searchComments(tenantId, userId, q, Math.min(maxResults, ENTITY_LIMITS.comments)))
        : Promise.resolve([]),
    ]);

  const totalMs = Math.round(performance.now() - start);

  return {
    clients: clientResults,
    projects: projectResults,
    tasks: taskResults,
    users: userResults,
    teams: teamResults,
    comments: commentResults,
    timing: { totalMs, perEntity: timings },
  };
}
