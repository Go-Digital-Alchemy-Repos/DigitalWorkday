import { createHash } from "crypto";
import { pool } from "../db";
import { TENANT_ID, WORKSPACE_ID, USER_IDS, CLIENT_IDS, PROJECT_IDS } from "./seedConstants";

const PROJECT_TO_CLIENT: Record<string, string> = {
  [PROJECT_IDS.websiteRedesign]: CLIENT_IDS.acme,
  [PROJECT_IDS.mobileApp]: CLIENT_IDS.globex,
  [PROJECT_IDS.brandRefresh]: CLIENT_IDS.initech,
  [PROJECT_IDS.apiIntegration]: CLIENT_IDS.acme,
  [PROJECT_IDS.marketingCampaign]: CLIENT_IDS.umbrella,
  [PROJECT_IDS.dataAnalytics]: CLIENT_IDS.wayne,
};

const allUsers = Object.values(USER_IDS);

function makeId(index: number): string {
  const hash = createHash("sha256").update(`time-entry-seed-${index}`).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    "4" + hash.slice(13, 16),
    "a" + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join("-");
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const rng = seededRandom(42);

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function weightedDaysAgo(): number {
  const r = rng();
  if (r < 0.4) return randInt(0, 14);
  if (r < 0.7) return randInt(15, 30);
  if (r < 0.9) return randInt(31, 60);
  return randInt(61, 90);
}

function randomDuration(): number {
  const r = rng();
  if (r < 0.2) return randInt(15, 30) * 60;
  if (r < 0.6) return randInt(60, 180) * 60;
  return randInt(240, 480) * 60;
}

function randomBillingStatus(): string {
  const r = rng();
  if (r < 0.25) return "draft";
  if (r < 0.45) return "pending_approval";
  if (r < 0.75) return "approved";
  if (r < 0.85) return "rejected";
  return "invoiced";
}

function randomScope(): string {
  return rng() < 0.8 ? "in_scope" : "out_of_scope";
}

interface EntryTemplate {
  titles: string[];
  descriptions: string[];
}

const projectEntryTemplates: Record<string, EntryTemplate> = {
  [PROJECT_IDS.websiteRedesign]: {
    titles: [
      "Homepage wireframe review",
      "Navigation component styling",
      "Hero section implementation",
      "Footer redesign",
      "Contact page layout",
      "Responsive breakpoints testing",
      "Image optimization pass",
      "Typography adjustments",
      "Color palette refinement",
      "Component library updates",
      "Design review meeting",
      "Accessibility audit",
      "CMS integration setup",
      "SEO metadata configuration",
      "Performance profiling",
    ],
    descriptions: [
      "Reviewed and iterated on the homepage wireframe with stakeholders",
      "Styled the main navigation bar for desktop and mobile views",
      "Built the hero section with animated transitions",
      "Redesigned the footer with updated links and social icons",
      "Laid out the contact page form and map integration",
      "Tested all breakpoints and fixed layout issues on tablet",
      "Compressed and lazy-loaded images across the site",
      "Fine-tuned heading and body font sizes for readability",
      "Adjusted the primary and secondary color values per client feedback",
      "Updated shared components in the design system",
      "Participated in design review with the Acme team",
      "Ran WCAG compliance checks on all pages",
      "Connected the CMS backend to the new page templates",
      "Added meta tags and structured data for search engines",
      "Profiled page load times and identified bottlenecks",
    ],
  },
  [PROJECT_IDS.mobileApp]: {
    titles: [
      "Login screen implementation",
      "Dashboard widget development",
      "Push notification setup",
      "API client integration",
      "Offline sync logic",
      "User profile screen",
      "Settings page UI",
      "Onboarding flow design",
      "Unit test writing",
      "Code review session",
      "Performance optimization",
      "Bug fix: crash on login",
      "App icon and splash screen",
      "Deep linking configuration",
      "State management refactor",
    ],
    descriptions: [
      "Implemented the login screen with email and biometric auth",
      "Built summary cards and chart widgets for the dashboard",
      "Configured Firebase Cloud Messaging for iOS and Android",
      "Integrated the REST API client with auth token refresh",
      "Wrote offline caching and background sync logic",
      "Built the user profile editing screen with avatar upload",
      "Created the settings page with theme and notification toggles",
      "Designed the 4-step onboarding tutorial for new users",
      "Wrote unit tests for authentication and data layers",
      "Reviewed pull requests and provided code feedback",
      "Optimized list rendering and reduced memory usage",
      "Fixed a crash caused by null token on cold start",
      "Designed and exported the app icon and splash assets",
      "Set up deep linking for notifications and share URLs",
      "Refactored global state to use a cleaner pattern",
    ],
  },
  [PROJECT_IDS.brandRefresh]: {
    titles: [
      "Competitor analysis research",
      "Logo concept sketches",
      "Color palette exploration",
      "Typography pairing research",
      "Brand guidelines drafting",
      "Social media template design",
      "Business card mockup",
      "Presentation template",
      "Icon set design",
      "Brand voice documentation",
      "Mood board creation",
      "Client presentation prep",
    ],
    descriptions: [
      "Researched competitor brand identities and positioning",
      "Sketched initial logo concepts based on brand strategy",
      "Explored color palettes that align with the new direction",
      "Tested typeface pairings for headings and body text",
      "Drafted the brand guidelines document structure",
      "Designed Instagram and LinkedIn post templates",
      "Created business card layouts with the new branding",
      "Built a PowerPoint template with brand colors and fonts",
      "Designed a custom icon set for the website and app",
      "Documented brand voice, tone, and messaging guidelines",
      "Assembled a mood board with visual references",
      "Prepared the deck for the client brand reveal meeting",
    ],
  },
  [PROJECT_IDS.apiIntegration]: {
    titles: [
      "API endpoint design",
      "Authentication middleware",
      "CRUD endpoint implementation",
      "Rate limiter development",
      "Webhook handler setup",
      "Error handling patterns",
      "Database query optimization",
      "API documentation writing",
      "Integration test suite",
      "Load testing",
      "Security audit",
      "Schema validation layer",
      "Pagination implementation",
      "Caching strategy design",
    ],
    descriptions: [
      "Designed RESTful endpoints following OpenAPI specification",
      "Built JWT-based authentication with token refresh flow",
      "Implemented create, read, update, delete for core resources",
      "Developed per-client rate limiting with sliding window",
      "Set up webhook delivery system with retry and backoff",
      "Standardized error response format and status codes",
      "Optimized slow queries with proper indexing",
      "Wrote API reference documentation with request examples",
      "Created integration tests covering all endpoints",
      "Ran load tests and identified throughput bottlenecks",
      "Reviewed API for common security vulnerabilities",
      "Added request/response validation using JSON schemas",
      "Implemented cursor-based pagination for list endpoints",
      "Designed Redis caching strategy for frequently read data",
    ],
  },
  [PROJECT_IDS.marketingCampaign]: {
    titles: [
      "Campaign strategy planning",
      "Landing page copy writing",
      "Email sequence drafting",
      "Social content creation",
      "Google Ads configuration",
      "Analytics tracking setup",
      "A/B test design",
      "Audience segmentation",
      "Creative asset production",
      "Campaign performance review",
      "Budget allocation review",
      "Influencer outreach",
    ],
    descriptions: [
      "Planned the overall campaign strategy and timeline",
      "Wrote conversion-focused copy for the landing page",
      "Drafted the 6-email nurture sequence for new leads",
      "Created social media posts for the campaign launch",
      "Set up Google Ads campaigns with targeting parameters",
      "Configured GA4 events and UTM tracking parameters",
      "Designed A/B test variants for the landing page headline",
      "Segmented the audience by demographics and behavior",
      "Produced banner ads and social media creative assets",
      "Reviewed campaign metrics and prepared a summary report",
      "Analyzed budget spend and reallocated across channels",
      "Reached out to industry influencers for partnerships",
    ],
  },
  [PROJECT_IDS.dataAnalytics]: {
    titles: [
      "Requirements gathering session",
      "Data warehouse schema design",
      "Dashboard wireframe creation",
      "ETL pipeline scaffolding",
      "KPI definition meeting",
      "Data source mapping",
      "Query performance tuning",
      "Visualization prototyping",
      "Data quality validation",
      "Stakeholder demo prep",
    ],
    descriptions: [
      "Interviewed stakeholders to gather reporting requirements",
      "Designed the dimensional schema for the data warehouse",
      "Created wireframes for executive and operational dashboards",
      "Scaffolded the ETL pipeline with extraction connectors",
      "Met with leadership to define and prioritize KPIs",
      "Mapped all data sources and documented field mappings",
      "Tuned slow analytical queries with indexing and partitioning",
      "Built interactive chart prototypes for the dashboard",
      "Validated data accuracy across all transformed tables",
      "Prepared the demo environment for the stakeholder review",
    ],
  },
};

const clientOnlyTemplates: Record<string, EntryTemplate> = {
  [CLIENT_IDS.acme]: {
    titles: ["Acme kickoff meeting", "Client call - requirements review", "Proposal revision", "Invoice preparation", "Account strategy session"],
    descriptions: ["Kickoff meeting for new engagement with Acme", "Reviewed updated requirements with the Acme team", "Revised the project proposal based on client feedback", "Prepared and sent the monthly invoice", "Discussed account growth strategy internally"],
  },
  [CLIENT_IDS.globex]: {
    titles: ["Globex status update call", "Scope change discussion", "Contract review", "Stakeholder alignment meeting", "Quarterly review prep"],
    descriptions: ["Weekly status update call with Globex", "Discussed scope changes requested by the client", "Reviewed contract terms for the next phase", "Aligned stakeholders on project priorities", "Prepared materials for the quarterly business review"],
  },
  [CLIENT_IDS.initech]: {
    titles: ["Initech discovery session", "Brand workshop facilitation", "Feedback incorporation", "Timeline replanning"],
    descriptions: ["Facilitated a discovery session with Initech leadership", "Led the brand workshop with the marketing team", "Incorporated client feedback into current deliverables", "Replanned the project timeline after scope adjustment"],
  },
  [CLIENT_IDS.umbrella]: {
    titles: ["Umbrella campaign briefing", "Content review session", "Campaign approval meeting", "Market research review"],
    descriptions: ["Briefing session for the upcoming campaign", "Reviewed all content pieces with the client", "Met with Umbrella leadership for campaign approval", "Reviewed market research findings together"],
  },
  [CLIENT_IDS.wayne]: {
    titles: ["Wayne Enterprises intro call", "Data requirements workshop", "Reporting needs assessment", "Executive dashboard planning"],
    descriptions: ["Introductory call with Wayne Enterprises team", "Workshop to define data requirements and sources", "Assessed reporting needs across departments", "Planned the executive dashboard layout and KPIs"],
  },
};

async function fetchTaskIds(): Promise<Record<string, string[]>> {
  const result = await pool.query(
    `SELECT id, project_id FROM tasks WHERE tenant_id = $1`,
    [TENANT_ID]
  );
  const tasksByProject: Record<string, string[]> = {};
  for (const row of result.rows) {
    if (!tasksByProject[row.project_id]) {
      tasksByProject[row.project_id] = [];
    }
    tasksByProject[row.project_id].push(row.id);
  }
  return tasksByProject;
}

async function seed() {
  console.log("Seeding time entries...\n");

  const tasksByProject = await fetchTaskIds();
  const now = Date.now();
  let insertedCount = 0;
  let skippedCount = 0;

  const entries: {
    id: string;
    userId: string;
    clientId: string | null;
    projectId: string | null;
    taskId: string | null;
    title: string;
    description: string;
    scope: string;
    billingStatus: string;
    startTime: Date;
    endTime: Date;
    durationSeconds: number;
  }[] = [];

  const allProjectIds = Object.values(PROJECT_IDS);

  for (let i = 0; i < 170; i++) {
    const r = rng();
    let clientId: string | null = null;
    let projectId: string | null = null;
    let taskId: string | null = null;
    let title: string;
    let description: string;

    if (r < 0.15) {
      clientId = pick(Object.values(CLIENT_IDS));
      const templates = clientOnlyTemplates[clientId];
      title = pick(templates.titles);
      description = pick(templates.descriptions);
    } else if (r < 0.55) {
      projectId = pick(allProjectIds);
      clientId = PROJECT_TO_CLIENT[projectId];
      const templates = projectEntryTemplates[projectId];
      title = pick(templates.titles);
      description = pick(templates.descriptions);
    } else {
      projectId = pick(allProjectIds);
      clientId = PROJECT_TO_CLIENT[projectId];
      const projectTasks = tasksByProject[projectId];
      if (projectTasks && projectTasks.length > 0) {
        taskId = pick(projectTasks);
      }
      const templates = projectEntryTemplates[projectId];
      title = pick(templates.titles);
      description = pick(templates.descriptions);
    }

    const daysBack = weightedDaysAgo();
    const hour = randInt(8, 17);
    const minute = randInt(0, 59);
    const startTime = new Date(now - daysBack * 86400000);
    startTime.setHours(hour, minute, 0, 0);

    const durationSeconds = randomDuration();
    const endTime = new Date(startTime.getTime() + durationSeconds * 1000);

    entries.push({
      id: makeId(i),
      userId: pick(allUsers),
      clientId,
      projectId,
      taskId,
      title,
      description,
      scope: randomScope(),
      billingStatus: randomBillingStatus(),
      startTime,
      endTime,
      durationSeconds,
    });
  }

  for (const e of entries) {
    const result = await pool.query(
      `INSERT INTO time_entries (id, tenant_id, workspace_id, user_id, client_id, project_id, task_id, title, description, scope, billing_status, start_time, end_time, duration_seconds, is_manual, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true, $12, $12)
       ON CONFLICT DO NOTHING`,
      [
        e.id,
        TENANT_ID,
        WORKSPACE_ID,
        e.userId,
        e.clientId,
        e.projectId,
        e.taskId,
        e.title,
        e.description,
        e.scope,
        e.billingStatus,
        e.startTime,
        e.endTime,
        e.durationSeconds,
      ]
    );
    if (result.rowCount && result.rowCount > 0) {
      insertedCount++;
    } else {
      skippedCount++;
    }
  }

  console.log(`\nInserted ${insertedCount} new time entries (${skippedCount} already existed).`);

  const stats = await pool.query(
    `SELECT
       COUNT(*) as total,
       COUNT(DISTINCT user_id) as users,
       COUNT(DISTINCT client_id) as clients,
       COUNT(DISTINCT project_id) as projects,
       COUNT(task_id) as with_tasks,
       COUNT(*) FILTER (WHERE project_id IS NULL) as client_only,
       MIN(start_time) as earliest,
       MAX(start_time) as latest
     FROM time_entries WHERE tenant_id = $1`,
    [TENANT_ID]
  );
  const s = stats.rows[0];
  console.log(`\nTime entry stats:`);
  console.log(`  Total entries: ${s.total}`);
  console.log(`  Unique users: ${s.users}`);
  console.log(`  Unique clients: ${s.clients}`);
  console.log(`  Unique projects: ${s.projects}`);
  console.log(`  Entries with tasks: ${s.with_tasks}`);
  console.log(`  Client-only entries: ${s.client_only}`);
  console.log(`  Date range: ${s.earliest} to ${s.latest}`);
}

seed()
  .then(() => {
    console.log("\nDone seeding time entries.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error seeding time entries:", err);
    process.exit(1);
  });
