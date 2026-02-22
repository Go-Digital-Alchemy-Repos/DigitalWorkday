import { scrypt, randomBytes, randomUUID } from "crypto";
import { promisify } from "util";
import { pool } from "../db";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

const TENANT_ID = "a0000000-0000-0000-0000-000000000001";
const WORKSPACE_ID = "w0000000-0000-0000-0000-000000000001";

const TEAM_IDS = {
  design: "t0000000-0000-0000-0000-000000000001",
  engineering: "t0000000-0000-0000-0000-000000000002",
  marketing: "t0000000-0000-0000-0000-000000000003",
};

const USER_IDS = {
  owner: "u0000000-0000-0000-0000-000000000001",
  sarah: "u0000000-0000-0000-0000-000000000002",
  mike: "u0000000-0000-0000-0000-000000000003",
  emma: "u0000000-0000-0000-0000-000000000004",
  james: "u0000000-0000-0000-0000-000000000005",
  lisa: "u0000000-0000-0000-0000-000000000006",
};

const CLIENT_IDS = {
  acme: "c0000000-0000-0000-0000-000000000001",
  globex: "c0000000-0000-0000-0000-000000000002",
  initech: "c0000000-0000-0000-0000-000000000003",
  umbrella: "c0000000-0000-0000-0000-000000000004",
  wayne: "c0000000-0000-0000-0000-000000000005",
};

const PROJECT_IDS = {
  websiteRedesign: "p0000000-0000-0000-0000-000000000001",
  mobileApp: "p0000000-0000-0000-0000-000000000002",
  brandRefresh: "p0000000-0000-0000-0000-000000000003",
  apiIntegration: "p0000000-0000-0000-0000-000000000004",
  marketingCampaign: "p0000000-0000-0000-0000-000000000005",
  dataAnalytics: "p0000000-0000-0000-0000-000000000006",
};

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);
const daysFromNow = (n: number) => new Date(now.getTime() + n * 86400000);

async function seed() {
  console.log("Seeding development data...\n");

  const passwordHash = await hashPassword("Password123!");

  // 1. Tenant
  console.log("Creating tenant...");
  await pool.query(`
    INSERT INTO tenants (id, name, slug, status, created_at, updated_at, onboarded_at, owner_user_id, industry, company_size, website, description, city, state, country)
    VALUES ($1, $2, $3, $4, $5, $5, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT DO NOTHING
  `, [
    TENANT_ID, "Bright Studio", "bright-studio", "active", daysAgo(90),
    USER_IDS.owner, "Creative Agency", "11-50", "https://brightstudio.com",
    "A full-service creative agency specializing in digital experiences",
    "San Francisco", "CA", "US"
  ]);

  // 2. Users
  console.log("Creating users...");
  const users = [
    { id: USER_IDS.owner, email: "alex@brightstudio.com", name: "Alex Rivera", first: "Alex", last: "Rivera", role: "admin" },
    { id: USER_IDS.sarah, email: "sarah@brightstudio.com", name: "Sarah Chen", first: "Sarah", last: "Chen", role: "admin" },
    { id: USER_IDS.mike, email: "mike@brightstudio.com", name: "Mike Johnson", first: "Mike", last: "Johnson", role: "member" },
    { id: USER_IDS.emma, email: "emma@brightstudio.com", name: "Emma Wilson", first: "Emma", last: "Wilson", role: "member" },
    { id: USER_IDS.james, email: "james@brightstudio.com", name: "James Park", first: "James", last: "Park", role: "member" },
    { id: USER_IDS.lisa, email: "lisa@brightstudio.com", name: "Lisa Martinez", first: "Lisa", last: "Martinez", role: "member" },
  ];

  for (const u of users) {
    await pool.query(`
      INSERT INTO users (id, email, name, password_hash, first_name, last_name, role, is_active, tenant_id, created_at, updated_at, must_change_password_on_next_login)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $9, false)
      ON CONFLICT DO NOTHING
    `, [u.id, u.email, u.name, passwordHash, u.first, u.last, u.role, TENANT_ID, daysAgo(90)]);
  }

  // 3. Workspace
  console.log("Creating workspace...");
  await pool.query(`
    INSERT INTO workspaces (id, name, created_by, tenant_id, is_primary, created_at, updated_at)
    VALUES ($1, $2, $3, $4, true, $5, $5)
    ON CONFLICT DO NOTHING
  `, [WORKSPACE_ID, "Bright Studio", USER_IDS.owner, TENANT_ID, daysAgo(90)]);

  // 4. Workspace members
  console.log("Creating workspace members...");
  for (const u of users) {
    const role = u.role === "admin" ? "admin" : "member";
    await pool.query(`
      INSERT INTO workspace_members (id, workspace_id, user_id, role, status, created_at)
      VALUES ($1, $2, $3, $4, 'active', $5)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), WORKSPACE_ID, u.id, role, daysAgo(90)]);
  }

  // 5. Teams
  console.log("Creating teams...");
  const teams = [
    { id: TEAM_IDS.design, name: "Design", members: [USER_IDS.sarah, USER_IDS.emma] },
    { id: TEAM_IDS.engineering, name: "Engineering", members: [USER_IDS.mike, USER_IDS.james] },
    { id: TEAM_IDS.marketing, name: "Marketing", members: [USER_IDS.lisa, USER_IDS.owner] },
  ];

  for (const t of teams) {
    await pool.query(`
      INSERT INTO teams (id, workspace_id, name, tenant_id, created_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING
    `, [t.id, WORKSPACE_ID, t.name, TENANT_ID, daysAgo(90)]);

    for (const memberId of t.members) {
      await pool.query(`
        INSERT INTO team_members (id, team_id, user_id, created_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING
      `, [randomUUID(), t.id, memberId, daysAgo(90)]);
    }
  }

  // 6. Clients
  console.log("Creating clients...");
  const clients = [
    { id: CLIENT_IDS.acme, company: "Acme Corporation", industry: "Technology", email: "contact@acme.com", phone: "(415) 555-0101", city: "San Jose", state: "CA", status: "active", stage: "active" },
    { id: CLIENT_IDS.globex, company: "Globex Industries", industry: "Manufacturing", email: "info@globex.com", phone: "(415) 555-0102", city: "Oakland", state: "CA", status: "active", stage: "active" },
    { id: CLIENT_IDS.initech, company: "Initech Solutions", industry: "Software", email: "hello@initech.com", phone: "(415) 555-0103", city: "Palo Alto", state: "CA", status: "active", stage: "active" },
    { id: CLIENT_IDS.umbrella, company: "Umbrella Health", industry: "Healthcare", email: "info@umbrella.com", phone: "(415) 555-0104", city: "San Francisco", state: "CA", status: "active", stage: "prospect" },
    { id: CLIENT_IDS.wayne, company: "Wayne Enterprises", industry: "Finance", email: "biz@wayne.com", phone: "(415) 555-0105", city: "New York", state: "NY", status: "active", stage: "lead" },
  ];

  for (const c of clients) {
    await pool.query(`
      INSERT INTO clients (id, workspace_id, company_name, industry, email, phone, city, state, country, status, stage, tenant_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'US', $9, $10, $11, $12, $12)
      ON CONFLICT DO NOTHING
    `, [c.id, WORKSPACE_ID, c.company, c.industry, c.email, c.phone, c.city, c.state, c.status, c.stage, TENANT_ID, daysAgo(60)]);
  }

  // 7. Client contacts
  console.log("Creating client contacts...");
  const contacts = [
    { clientId: CLIENT_IDS.acme, first: "John", last: "Smith", email: "john@acme.com", phone: "(415) 555-1001", title: "VP of Engineering", isPrimary: true },
    { clientId: CLIENT_IDS.acme, first: "Amy", last: "Lee", email: "amy@acme.com", phone: "(415) 555-1002", title: "Product Manager", isPrimary: false },
    { clientId: CLIENT_IDS.globex, first: "Bob", last: "Taylor", email: "bob@globex.com", phone: "(415) 555-1003", title: "CTO", isPrimary: true },
    { clientId: CLIENT_IDS.initech, first: "Carol", last: "White", email: "carol@initech.com", phone: "(415) 555-1004", title: "Director of Marketing", isPrimary: true },
    { clientId: CLIENT_IDS.umbrella, first: "Dave", last: "Brown", email: "dave@umbrella.com", phone: "(415) 555-1005", title: "CEO", isPrimary: true },
    { clientId: CLIENT_IDS.wayne, first: "Bruce", last: "Wayne", email: "bruce@wayne.com", phone: "(212) 555-1006", title: "President", isPrimary: true },
  ];

  for (const ct of contacts) {
    await pool.query(`
      INSERT INTO client_contacts (id, client_id, workspace_id, first_name, last_name, email, phone, title, is_primary, tenant_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), ct.clientId, WORKSPACE_ID, ct.first, ct.last, ct.email, ct.phone, ct.title, ct.isPrimary, TENANT_ID, daysAgo(55)]);
  }

  // 8. Projects
  console.log("Creating projects...");
  const projects = [
    { id: PROJECT_IDS.websiteRedesign, name: "Website Redesign", desc: "Complete redesign of the Acme corporate website with modern UI/UX", status: "active", color: "#3B82F6", clientId: CLIENT_IDS.acme, teamId: TEAM_IDS.design, budget: 4800 },
    { id: PROJECT_IDS.mobileApp, name: "Mobile App Development", desc: "Build iOS and Android app for Globex customer portal", status: "active", color: "#10B981", clientId: CLIENT_IDS.globex, teamId: TEAM_IDS.engineering, budget: 9600 },
    { id: PROJECT_IDS.brandRefresh, name: "Brand Refresh", desc: "Update brand identity and style guide for Initech", status: "active", color: "#8B5CF6", clientId: CLIENT_IDS.initech, teamId: TEAM_IDS.design, budget: 3600 },
    { id: PROJECT_IDS.apiIntegration, name: "API Integration Platform", desc: "Build REST API integration layer for Acme systems", status: "active", color: "#F59E0B", clientId: CLIENT_IDS.acme, teamId: TEAM_IDS.engineering, budget: 7200 },
    { id: PROJECT_IDS.marketingCampaign, name: "Q1 Marketing Campaign", desc: "Digital marketing campaign for Umbrella Health product launch", status: "active", color: "#EF4444", clientId: CLIENT_IDS.umbrella, teamId: TEAM_IDS.marketing, budget: 2400 },
    { id: PROJECT_IDS.dataAnalytics, name: "Data Analytics Dashboard", desc: "Custom analytics dashboard for Wayne Enterprises reporting needs", status: "on_hold", color: "#06B6D4", clientId: CLIENT_IDS.wayne, teamId: TEAM_IDS.engineering, budget: 6000 },
  ];

  for (const p of projects) {
    await pool.query(`
      INSERT INTO projects (id, workspace_id, team_id, name, description, visibility, status, color, created_by, client_id, tenant_id, budget_minutes, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'public', $6, $7, $8, $9, $10, $11, $12, $12)
      ON CONFLICT DO NOTHING
    `, [p.id, WORKSPACE_ID, p.teamId, p.name, p.desc, p.status, p.color, USER_IDS.owner, p.clientId, TENANT_ID, p.budget, daysAgo(45)]);
  }

  // 9. Project members
  console.log("Creating project members...");
  const projectMembers = [
    { projectId: PROJECT_IDS.websiteRedesign, users: [USER_IDS.sarah, USER_IDS.emma, USER_IDS.owner] },
    { projectId: PROJECT_IDS.mobileApp, users: [USER_IDS.mike, USER_IDS.james, USER_IDS.owner] },
    { projectId: PROJECT_IDS.brandRefresh, users: [USER_IDS.sarah, USER_IDS.emma, USER_IDS.lisa] },
    { projectId: PROJECT_IDS.apiIntegration, users: [USER_IDS.mike, USER_IDS.james] },
    { projectId: PROJECT_IDS.marketingCampaign, users: [USER_IDS.lisa, USER_IDS.owner, USER_IDS.emma] },
    { projectId: PROJECT_IDS.dataAnalytics, users: [USER_IDS.james, USER_IDS.mike] },
  ];

  for (const pm of projectMembers) {
    for (const userId of pm.users) {
      await pool.query(`
        INSERT INTO project_members (id, project_id, user_id, role, created_at)
        VALUES ($1, $2, $3, 'member', $4)
        ON CONFLICT DO NOTHING
      `, [randomUUID(), pm.projectId, userId, daysAgo(45)]);
    }
  }

  // 10. Sections for projects
  console.log("Creating sections...");
  const sectionDefs = [
    { projectId: PROJECT_IDS.websiteRedesign, sections: ["Backlog", "In Progress", "Review", "Done"] },
    { projectId: PROJECT_IDS.mobileApp, sections: ["To Do", "Development", "QA Testing", "Ready for Release", "Released"] },
    { projectId: PROJECT_IDS.brandRefresh, sections: ["Research", "Concepts", "Refinement", "Final Delivery"] },
    { projectId: PROJECT_IDS.apiIntegration, sections: ["Planning", "Development", "Integration Testing", "Deployed"] },
    { projectId: PROJECT_IDS.marketingCampaign, sections: ["Ideas", "In Production", "Review", "Published"] },
    { projectId: PROJECT_IDS.dataAnalytics, sections: ["Requirements", "Design", "Build", "Testing"] },
  ];

  const sectionIds: Record<string, string[]> = {};

  for (const sd of sectionDefs) {
    sectionIds[sd.projectId] = [];
    for (let i = 0; i < sd.sections.length; i++) {
      const sId = randomUUID();
      sectionIds[sd.projectId].push(sId);
      await pool.query(`
        INSERT INTO sections (id, project_id, name, order_index, created_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [sId, sd.projectId, sd.sections[i], i, daysAgo(44)]);
    }
  }

  // 11. Tasks
  console.log("Creating tasks...");
  interface TaskDef {
    title: string;
    desc: string;
    status: string;
    priority: string;
    sectionIdx: number;
    assignees: string[];
    dueDate: Date | null;
    estimate?: number;
  }

  const taskSets: { projectId: string; tasks: TaskDef[] }[] = [
    {
      projectId: PROJECT_IDS.websiteRedesign,
      tasks: [
        { title: "Design homepage mockups", desc: "Create 3 design options for the new homepage", status: "completed", priority: "high", sectionIdx: 3, assignees: [USER_IDS.sarah], dueDate: daysAgo(10), estimate: 480 },
        { title: "Build responsive navigation", desc: "Implement responsive nav with mobile hamburger menu", status: "in_progress", priority: "high", sectionIdx: 1, assignees: [USER_IDS.emma], dueDate: daysFromNow(3), estimate: 360 },
        { title: "Create component library", desc: "Build reusable UI component library in Figma and code", status: "in_progress", priority: "medium", sectionIdx: 1, assignees: [USER_IDS.sarah, USER_IDS.emma], dueDate: daysFromNow(7), estimate: 960 },
        { title: "SEO audit and optimization", desc: "Run full SEO audit and implement improvements", status: "todo", priority: "medium", sectionIdx: 0, assignees: [USER_IDS.lisa], dueDate: daysFromNow(14), estimate: 240 },
        { title: "Content migration plan", desc: "Plan and document content migration from old site", status: "todo", priority: "low", sectionIdx: 0, assignees: [], dueDate: daysFromNow(21), estimate: 120 },
        { title: "User testing sessions", desc: "Conduct 5 user testing sessions with target audience", status: "todo", priority: "high", sectionIdx: 0, assignees: [USER_IDS.sarah], dueDate: daysFromNow(10), estimate: 300 },
        { title: "Performance optimization", desc: "Optimize page load speed to under 2 seconds", status: "in_review", priority: "medium", sectionIdx: 2, assignees: [USER_IDS.emma], dueDate: daysFromNow(5), estimate: 180 },
        { title: "Accessibility compliance", desc: "Ensure WCAG 2.1 AA compliance across all pages", status: "todo", priority: "high", sectionIdx: 0, assignees: [USER_IDS.emma], dueDate: daysFromNow(18), estimate: 480 },
      ],
    },
    {
      projectId: PROJECT_IDS.mobileApp,
      tasks: [
        { title: "Set up React Native project", desc: "Initialize project with TypeScript, navigation, and state management", status: "completed", priority: "high", sectionIdx: 4, assignees: [USER_IDS.mike], dueDate: daysAgo(20), estimate: 240 },
        { title: "Design app wireframes", desc: "Create wireframes for all core screens", status: "completed", priority: "high", sectionIdx: 4, assignees: [USER_IDS.sarah], dueDate: daysAgo(15), estimate: 480 },
        { title: "Implement authentication flow", desc: "Build login, signup, forgot password screens with biometric support", status: "completed", priority: "high", sectionIdx: 3, assignees: [USER_IDS.mike], dueDate: daysAgo(5), estimate: 600 },
        { title: "Build dashboard screen", desc: "Implement main dashboard with charts and summary cards", status: "in_progress", priority: "high", sectionIdx: 1, assignees: [USER_IDS.james], dueDate: daysFromNow(5), estimate: 480 },
        { title: "Push notification system", desc: "Set up Firebase Cloud Messaging for push notifications", status: "in_progress", priority: "medium", sectionIdx: 1, assignees: [USER_IDS.mike], dueDate: daysFromNow(8), estimate: 360 },
        { title: "Offline mode support", desc: "Implement offline data caching and sync", status: "todo", priority: "medium", sectionIdx: 0, assignees: [USER_IDS.james], dueDate: daysFromNow(15), estimate: 720 },
        { title: "App Store submission prep", desc: "Prepare screenshots, descriptions, and metadata for app stores", status: "todo", priority: "low", sectionIdx: 0, assignees: [], dueDate: daysFromNow(30), estimate: 240 },
        { title: "Integration testing suite", desc: "Write comprehensive integration tests for all API interactions", status: "todo", priority: "medium", sectionIdx: 0, assignees: [USER_IDS.mike], dueDate: daysFromNow(20), estimate: 480 },
        { title: "Beta testing rollout", desc: "Deploy to TestFlight and Google Play beta track", status: "todo", priority: "high", sectionIdx: 0, assignees: [USER_IDS.james], dueDate: daysFromNow(25), estimate: 120 },
      ],
    },
    {
      projectId: PROJECT_IDS.brandRefresh,
      tasks: [
        { title: "Competitor brand analysis", desc: "Analyze top 10 competitor brand identities", status: "completed", priority: "high", sectionIdx: 3, assignees: [USER_IDS.sarah], dueDate: daysAgo(20), estimate: 360 },
        { title: "New logo concepts", desc: "Design 5 logo variations based on brand strategy", status: "in_progress", priority: "high", sectionIdx: 1, assignees: [USER_IDS.sarah], dueDate: daysFromNow(4), estimate: 600 },
        { title: "Color palette definition", desc: "Define primary, secondary, and accent color palettes", status: "in_progress", priority: "medium", sectionIdx: 1, assignees: [USER_IDS.emma], dueDate: daysFromNow(6), estimate: 180 },
        { title: "Typography selection", desc: "Select heading and body typefaces with web licensing", status: "todo", priority: "medium", sectionIdx: 0, assignees: [USER_IDS.emma], dueDate: daysFromNow(10), estimate: 120 },
        { title: "Brand guidelines document", desc: "Create comprehensive brand guidelines PDF", status: "todo", priority: "high", sectionIdx: 0, assignees: [USER_IDS.sarah], dueDate: daysFromNow(20), estimate: 480 },
        { title: "Social media templates", desc: "Design templates for Instagram, LinkedIn, and Twitter", status: "todo", priority: "low", sectionIdx: 0, assignees: [USER_IDS.lisa], dueDate: daysFromNow(25), estimate: 360 },
      ],
    },
    {
      projectId: PROJECT_IDS.apiIntegration,
      tasks: [
        { title: "API architecture design", desc: "Design RESTful API architecture with OpenAPI spec", status: "completed", priority: "high", sectionIdx: 3, assignees: [USER_IDS.mike], dueDate: daysAgo(14), estimate: 480 },
        { title: "Authentication middleware", desc: "Build JWT-based auth middleware with refresh tokens", status: "completed", priority: "high", sectionIdx: 3, assignees: [USER_IDS.james], dueDate: daysAgo(7), estimate: 360 },
        { title: "Core CRUD endpoints", desc: "Implement CRUD operations for all primary resources", status: "in_progress", priority: "high", sectionIdx: 1, assignees: [USER_IDS.mike, USER_IDS.james], dueDate: daysFromNow(7), estimate: 960 },
        { title: "Rate limiting and throttling", desc: "Implement API rate limiting per client", status: "todo", priority: "medium", sectionIdx: 0, assignees: [USER_IDS.james], dueDate: daysFromNow(12), estimate: 240 },
        { title: "Webhook system", desc: "Build webhook delivery system with retry logic", status: "todo", priority: "medium", sectionIdx: 0, assignees: [USER_IDS.mike], dueDate: daysFromNow(18), estimate: 480 },
        { title: "API documentation portal", desc: "Set up Swagger UI documentation portal", status: "todo", priority: "low", sectionIdx: 0, assignees: [], dueDate: daysFromNow(22), estimate: 240 },
      ],
    },
    {
      projectId: PROJECT_IDS.marketingCampaign,
      tasks: [
        { title: "Campaign strategy document", desc: "Define target audience, messaging, and channel strategy", status: "completed", priority: "high", sectionIdx: 3, assignees: [USER_IDS.lisa], dueDate: daysAgo(12), estimate: 360 },
        { title: "Landing page design", desc: "Design conversion-optimized landing page", status: "in_progress", priority: "high", sectionIdx: 1, assignees: [USER_IDS.emma], dueDate: daysFromNow(3), estimate: 300 },
        { title: "Email sequence creation", desc: "Write 6-email nurture sequence for leads", status: "in_progress", priority: "medium", sectionIdx: 1, assignees: [USER_IDS.lisa], dueDate: daysFromNow(5), estimate: 480 },
        { title: "Social media content calendar", desc: "Plan 4 weeks of social content", status: "todo", priority: "medium", sectionIdx: 0, assignees: [USER_IDS.lisa], dueDate: daysFromNow(8), estimate: 240 },
        { title: "Google Ads setup", desc: "Configure Google Ads campaigns with A/B testing", status: "todo", priority: "high", sectionIdx: 0, assignees: [USER_IDS.owner], dueDate: daysFromNow(10), estimate: 300 },
        { title: "Analytics tracking setup", desc: "Set up GA4, conversion tracking, and UTM parameters", status: "todo", priority: "medium", sectionIdx: 0, assignees: [USER_IDS.owner], dueDate: daysFromNow(6), estimate: 180 },
      ],
    },
    {
      projectId: PROJECT_IDS.dataAnalytics,
      tasks: [
        { title: "Gather reporting requirements", desc: "Interview stakeholders and document all KPIs and metrics needed", status: "completed", priority: "high", sectionIdx: 3, assignees: [USER_IDS.james], dueDate: daysAgo(8), estimate: 360 },
        { title: "Database schema design", desc: "Design data warehouse schema for analytics", status: "in_progress", priority: "high", sectionIdx: 1, assignees: [USER_IDS.james], dueDate: daysFromNow(5), estimate: 480 },
        { title: "Dashboard wireframes", desc: "Create wireframes for executive and operational dashboards", status: "todo", priority: "medium", sectionIdx: 0, assignees: [USER_IDS.sarah], dueDate: daysFromNow(12), estimate: 240 },
        { title: "ETL pipeline development", desc: "Build data extraction and transformation pipelines", status: "todo", priority: "high", sectionIdx: 0, assignees: [USER_IDS.mike], dueDate: daysFromNow(20), estimate: 720 },
      ],
    },
  ];

  let taskOrder = 0;
  for (const ts of taskSets) {
    const sections = sectionIds[ts.projectId];
    for (const task of ts.tasks) {
      const taskId = randomUUID();
      await pool.query(`
        INSERT INTO tasks (id, project_id, section_id, title, description, status, priority, due_date, created_by, order_index, tenant_id, is_personal, estimate_minutes, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, $12, $13, $13)
        ON CONFLICT DO NOTHING
      `, [
        taskId, ts.projectId, sections[task.sectionIdx],
        task.title, task.desc, task.status, task.priority,
        task.dueDate, USER_IDS.owner, taskOrder++,
        TENANT_ID, task.estimate || null, daysAgo(40)
      ]);

      for (const assigneeId of task.assignees) {
        await pool.query(`
          INSERT INTO task_assignees (id, task_id, user_id, tenant_id, created_at)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT DO NOTHING
        `, [randomUUID(), taskId, assigneeId, TENANT_ID, daysAgo(40)]);
      }
    }
  }

  // 12. Tags
  console.log("Creating tags...");
  const tagDefs = [
    { name: "urgent", color: "#EF4444" },
    { name: "bug", color: "#F59E0B" },
    { name: "feature", color: "#3B82F6" },
    { name: "design", color: "#8B5CF6" },
    { name: "frontend", color: "#10B981" },
    { name: "backend", color: "#06B6D4" },
    { name: "documentation", color: "#6B7280" },
    { name: "client-facing", color: "#EC4899" },
  ];

  // Check tags table columns
  const tagCols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'tags' ORDER BY ordinal_position`);
  const tagColNames = tagCols.rows.map((r: any) => r.column_name);

  for (const tag of tagDefs) {
    if (tagColNames.includes("tenant_id")) {
      await pool.query(`
        INSERT INTO tags (id, workspace_id, name, color, tenant_id, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING
      `, [randomUUID(), WORKSPACE_ID, tag.name, tag.color, TENANT_ID, daysAgo(44)]);
    } else {
      await pool.query(`
        INSERT INTO tags (id, workspace_id, name, color, created_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [randomUUID(), WORKSPACE_ID, tag.name, tag.color, daysAgo(44)]);
    }
  }

  // 13. Tenant settings
  console.log("Creating tenant settings...");
  const settingsCols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'tenant_settings' ORDER BY ordinal_position`);
  const settingsColNames = settingsCols.rows.map((r: any) => r.column_name);

  if (settingsColNames.length > 0) {
    await pool.query(`
      INSERT INTO tenant_settings (id, tenant_id, display_name, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $4)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), TENANT_ID, "Bright Studio", daysAgo(90)]);
  }

  // Summary
  const counts = await pool.query(`
    SELECT 'tenants' as t, COUNT(*) as c FROM tenants WHERE id = $1
    UNION ALL SELECT 'users', COUNT(*) FROM users WHERE tenant_id = $1
    UNION ALL SELECT 'clients', COUNT(*) FROM clients WHERE tenant_id = $1
    UNION ALL SELECT 'projects', COUNT(*) FROM projects WHERE tenant_id = $1
    UNION ALL SELECT 'tasks', COUNT(*) FROM tasks WHERE tenant_id = $1
    UNION ALL SELECT 'teams', COUNT(*) FROM teams WHERE tenant_id = $1
  `, [TENANT_ID]);

  console.log("\n=== Seed Data Summary ===");
  for (const row of counts.rows) {
    console.log(`  ${row.t}: ${row.c}`);
  }
  console.log("\n=== Login Credentials ===");
  console.log("  All tenant users use password: Password123!");
  console.log("  Owner/Admin: alex@brightstudio.com");
  console.log("  Admin: sarah@brightstudio.com");
  console.log("  Members: mike@, emma@, james@, lisa@ @brightstudio.com");
  console.log("\n  Super Admin: admin@myworkday.dev / SuperAdmin123!");
  console.log("\nDone!");
}

seed()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    pool.end().then(() => process.exit(1));
  });
