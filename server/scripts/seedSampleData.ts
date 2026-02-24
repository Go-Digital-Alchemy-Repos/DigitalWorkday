import { randomUUID } from "crypto";
import { pool } from "../db";

function toTipTapDoc(text: string): object {
  const paragraphs = text.split("\n").map(line => ({
    type: "paragraph",
    content: line.trim() ? [{ type: "text", text: line }] : []
  }));
  return { type: "doc", content: paragraphs };
}

const TENANT_ID = "a0000000-0000-0000-0000-000000000001";
const WORKSPACE_ID = "w0000000-0000-0000-0000-000000000001";

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
const hoursAgo = (n: number) => new Date(now.getTime() - n * 3600000);
const minsAgo = (n: number) => new Date(now.getTime() - n * 60000);

const allUserIds = Object.values(USER_IDS);
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

async function seed() {
  console.log("🌱 Seeding comprehensive sample data...\n");

  // ── 1. Task Comments ─────────────────────────────────────────────────
  console.log("💬 Creating task comments...");
  const taskRows = await pool.query(
    `SELECT id, project_id FROM tasks WHERE tenant_id = $1 ORDER BY created_at LIMIT 30`,
    [TENANT_ID]
  );
  const taskIds = taskRows.rows.map((r: any) => r.id);

  const commentData = [
    { body: "I've finished the initial wireframes. Please review when you get a chance.", user: USER_IDS.emma, ago: 5 },
    { body: "Looks great! I have a few minor suggestions on the color palette. Let's discuss in standup.", user: USER_IDS.sarah, ago: 4.5 },
    { body: "Updated based on feedback. The new mockups are attached to the task.", user: USER_IDS.emma, ago: 4 },
    { body: "The API endpoint is returning a 500 error on the staging server. Looking into it now.", user: USER_IDS.mike, ago: 3 },
    { body: "Found the issue — it was a missing env variable. Fixed and deployed to staging.", user: USER_IDS.james, ago: 2.8 },
    { body: "Client wants to change the hero section layout. I'll update the design file.", user: USER_IDS.sarah, ago: 2 },
    { body: "Can we prioritize this? The client deadline is next Friday.", user: USER_IDS.owner, ago: 1.5 },
    { body: "I'll have the responsive version ready by end of day tomorrow.", user: USER_IDS.mike, ago: 1 },
    { body: "Just pushed the accessibility fixes. All WCAG 2.1 AA checks are passing now.", user: USER_IDS.james, ago: 0.5 },
    { body: "Great work team! This is shaping up nicely. Let's keep the momentum going.", user: USER_IDS.owner, ago: 0.2 },
    { body: "The performance benchmarks look solid — LCP under 2s on mobile.", user: USER_IDS.mike, ago: 3.5 },
    { body: "I've added loading skeletons for all the key components. Much better UX now.", user: USER_IDS.emma, ago: 3.2 },
    { body: "Need to coordinate with the content team on the blog migration timeline.", user: USER_IDS.lisa, ago: 2.5 },
    { body: "Analytics tracking is set up. We can now measure conversion funnels.", user: USER_IDS.james, ago: 2.2 },
    { body: "Client approved the final mockups! We're good to proceed with development.", user: USER_IDS.sarah, ago: 1.8 },
    { body: "The test suite is passing. I've also added integration tests for the new features.", user: USER_IDS.mike, ago: 1.2 },
    { body: "Please review the copy changes — the marketing team sent over updates.", user: USER_IDS.lisa, ago: 0.8 },
    { body: "Merged the PR. Let's schedule a code review session for the next sprint.", user: USER_IDS.james, ago: 0.3 },
    { body: "I'll handle the QA testing for this feature. Adding it to my sprint backlog.", user: USER_IDS.emma, ago: 6 },
    { body: "We should add error boundary components to prevent full-page crashes.", user: USER_IDS.mike, ago: 5.5 },
  ];

  for (let i = 0; i < commentData.length; i++) {
    const c = commentData[i];
    const taskId = taskIds[i % taskIds.length];
    await pool.query(`
      INSERT INTO comments (id, task_id, user_id, body, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $5)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), taskId, c.user, c.body, daysAgo(c.ago)]);
  }

  // ── 2. Subtasks ───────────────────────────────────────────────────────
  console.log("📋 Creating subtasks...");
  const subtaskSets = [
    { taskIdx: 0, subtasks: [
      { title: "Create homepage wireframe", completed: true, assignee: USER_IDS.emma },
      { title: "Design navigation components", completed: true, assignee: USER_IDS.sarah },
      { title: "Build icon set", completed: false, assignee: USER_IDS.emma },
      { title: "Finalize color palette", completed: true, assignee: USER_IDS.sarah },
    ]},
    { taskIdx: 1, subtasks: [
      { title: "Set up responsive breakpoints", completed: true, assignee: USER_IDS.mike },
      { title: "Implement mobile hamburger menu", completed: false, assignee: USER_IDS.mike },
      { title: "Test on iOS Safari", completed: false, assignee: USER_IDS.james },
    ]},
    { taskIdx: 2, subtasks: [
      { title: "Button component variants", completed: true, assignee: USER_IDS.emma },
      { title: "Form input components", completed: true, assignee: USER_IDS.mike },
      { title: "Modal/dialog system", completed: false, assignee: USER_IDS.james },
      { title: "Toast notification component", completed: true, assignee: USER_IDS.mike },
      { title: "Data table component", completed: false, assignee: USER_IDS.james },
    ]},
    { taskIdx: 3, subtasks: [
      { title: "Audit existing content pages", completed: true, assignee: USER_IDS.lisa },
      { title: "Create content mapping spreadsheet", completed: true, assignee: USER_IDS.lisa },
      { title: "Set up redirect rules", completed: false, assignee: USER_IDS.james },
    ]},
    { taskIdx: 5, subtasks: [
      { title: "Set up React Native project", completed: true, assignee: USER_IDS.mike },
      { title: "Configure navigation stack", completed: true, assignee: USER_IDS.mike },
      { title: "Implement auth screens", completed: false, assignee: USER_IDS.james },
      { title: "Build onboarding flow", completed: false, assignee: USER_IDS.emma },
    ]},
  ];

  for (const set of subtaskSets) {
    const taskId = taskIds[set.taskIdx % taskIds.length];
    for (let i = 0; i < set.subtasks.length; i++) {
      const s = set.subtasks[i];
      await pool.query(`
        INSERT INTO subtasks (id, task_id, title, completed, assignee_id, order_index, status, priority, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'medium', $8, $8)
        ON CONFLICT DO NOTHING
      `, [randomUUID(), taskId, s.title, s.completed, s.assignee, i, s.completed ? 'done' : 'in_progress', daysAgo(10 - i)]);
    }
  }

  // ── 3. Chat Channels & Messages ───────────────────────────────────────
  console.log("💬 Creating chat channels and messages...");

  const channelNames = ["general", "design-team", "engineering", "random", "client-updates"];
  const channelCreators: Record<string, string> = {
    "general": USER_IDS.owner,
    "design-team": USER_IDS.sarah,
    "engineering": USER_IDS.mike,
    "random": USER_IDS.owner,
    "client-updates": USER_IDS.owner,
  };
  const channelPrivacy: Record<string, boolean> = { "client-updates": true };

  const channelIds: Record<string, string> = {};
  for (const name of channelNames) {
    const existingRow = await pool.query(`SELECT id FROM chat_channels WHERE tenant_id = $1 AND lower(name) = $2`, [TENANT_ID, name]);
    if (existingRow.rows.length > 0) {
      channelIds[name] = existingRow.rows[0].id;
    } else {
      const newId = randomUUID();
      await pool.query(`
        INSERT INTO chat_channels (id, tenant_id, name, is_private, created_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [newId, TENANT_ID, name, channelPrivacy[name] || false, channelCreators[name], daysAgo(60)]);
      channelIds[name] = newId;
    }

    for (const userId of allUserIds) {
      await pool.query(`
        INSERT INTO chat_channel_members (id, tenant_id, channel_id, user_id, role, created_at)
        VALUES ($1, $2, $3, $4, 'member', $5)
        ON CONFLICT DO NOTHING
      `, [randomUUID(), TENANT_ID, channelIds[name], userId, daysAgo(60)]);
    }
  }

  const chatMessages = [
    { channel: channelIds.general, author: USER_IDS.owner, body: "Good morning team! 🌅 Hope everyone had a great weekend.", ago: 48 },
    { channel: channelIds.general, author: USER_IDS.sarah, body: "Morning! Ready to tackle this week's sprint.", ago: 47.5 },
    { channel: channelIds.general, author: USER_IDS.mike, body: "Hey all! Just deployed the latest build to staging. Please test when you get a chance.", ago: 47 },
    { channel: channelIds.general, author: USER_IDS.emma, body: "Nice! I'll review the UI changes after my design review meeting.", ago: 46 },
    { channel: channelIds.general, author: USER_IDS.james, body: "Heads up — I'll be out Thursday afternoon for a dentist appointment.", ago: 45 },
    { channel: channelIds.general, author: USER_IDS.lisa, body: "The client newsletter went out this morning. Open rates looking good so far!", ago: 44 },
    { channel: channelIds.general, author: USER_IDS.owner, body: "Reminder: All-hands meeting at 3pm today. I'll share Q1 results.", ago: 24 },
    { channel: channelIds.general, author: USER_IDS.mike, body: "Looking forward to it! The engineering metrics have been solid this quarter.", ago: 23.5 },
    { channel: channelIds.general, author: USER_IDS.sarah, body: "Can we also discuss the design system roadmap?", ago: 23 },
    { channel: channelIds.general, author: USER_IDS.owner, body: "Absolutely, I've added it to the agenda.", ago: 22.5 },
    { channel: channelIds.general, author: USER_IDS.emma, body: "Just pushed the new component library updates. Everything looks crisp!", ago: 6 },
    { channel: channelIds.general, author: USER_IDS.james, body: "The CI/CD pipeline improvements cut deploy times by 40%. 🚀", ago: 4 },
    { channel: channelIds.general, author: USER_IDS.lisa, body: "Blog post draft is ready for review: \"5 Tips for Remote Team Productivity\"", ago: 2 },
    { channel: channelIds.general, author: USER_IDS.owner, body: "Great work this week everyone. Let's keep crushing it! 💪", ago: 1 },

    { channel: channelIds["design-team"], author: USER_IDS.sarah, body: "I've uploaded the new brand guidelines to the shared drive.", ago: 36 },
    { channel: channelIds["design-team"], author: USER_IDS.emma, body: "Love the new color system! The gradient combinations are 🔥", ago: 35 },
    { channel: channelIds["design-team"], author: USER_IDS.sarah, body: "Thanks! Let's make sure all components get updated this sprint.", ago: 34.5 },
    { channel: channelIds["design-team"], author: USER_IDS.emma, body: "Working on the icon refresh now. Should have V1 ready by EOD.", ago: 30 },
    { channel: channelIds["design-team"], author: USER_IDS.sarah, body: "The client feedback on the dashboard redesign was very positive.", ago: 12 },
    { channel: channelIds["design-team"], author: USER_IDS.emma, body: "Should we schedule a design review for the mobile screens?", ago: 8 },
    { channel: channelIds["design-team"], author: USER_IDS.sarah, body: "Yes, let's do tomorrow at 2pm. I'll set up the Figma session.", ago: 7 },

    { channel: channelIds.engineering, author: USER_IDS.mike, body: "Found a performance bottleneck in the dashboard query. Working on optimizing it.", ago: 40 },
    { channel: channelIds.engineering, author: USER_IDS.james, body: "What was the issue? N+1 queries?", ago: 39 },
    { channel: channelIds.engineering, author: USER_IDS.mike, body: "Exactly. Added eager loading and the response time dropped from 2s to 200ms.", ago: 38 },
    { channel: channelIds.engineering, author: USER_IDS.james, body: "Nice! I've been working on the WebSocket connection pooling. Should reduce memory usage.", ago: 37 },
    { channel: channelIds.engineering, author: USER_IDS.mike, body: "PR is up for the new caching layer. Can you review when free?", ago: 20 },
    { channel: channelIds.engineering, author: USER_IDS.james, body: "On it. Also, the test coverage report shows we're at 82% now.", ago: 19 },
    { channel: channelIds.engineering, author: USER_IDS.mike, body: "Great progress! Let's push for 85% by end of month.", ago: 18 },
    { channel: channelIds.engineering, author: USER_IDS.james, body: "Database migration went smoothly. Zero downtime. ✅", ago: 5 },

    { channel: channelIds.random, author: USER_IDS.lisa, body: "Who's up for team lunch this Friday? 🍕", ago: 30 },
    { channel: channelIds.random, author: USER_IDS.mike, body: "Count me in! How about that new ramen place?", ago: 29.5 },
    { channel: channelIds.random, author: USER_IDS.emma, body: "Yes! I've been wanting to try it. They have great reviews.", ago: 29 },
    { channel: channelIds.random, author: USER_IDS.james, body: "I'll make a reservation for 12:30.", ago: 28 },
    { channel: channelIds.random, author: USER_IDS.sarah, body: "Has anyone seen the new Marvel movie? No spoilers please!", ago: 10 },
    { channel: channelIds.random, author: USER_IDS.owner, body: "Happy birthday to Emma today! 🎂🎉", ago: 3 },
    { channel: channelIds.random, author: USER_IDS.mike, body: "Happy birthday Emma!! 🥳", ago: 2.8 },
    { channel: channelIds.random, author: USER_IDS.emma, body: "Aww thanks everyone! You're the best team! ❤️", ago: 2.5 },

    { channel: channelIds["client-updates"], author: USER_IDS.owner, body: "Acme Corp signed the extension for Phase 2. Budget approved!", ago: 24 },
    { channel: channelIds["client-updates"], author: USER_IDS.sarah, body: "Globex Industries wants to add a mobile app to their scope.", ago: 20 },
    { channel: channelIds["client-updates"], author: USER_IDS.owner, body: "Let's prepare a proposal for Globex by next Wednesday.", ago: 19 },
    { channel: channelIds["client-updates"], author: USER_IDS.lisa, body: "Initech is very happy with the Q1 deliverables. They mentioned us in their newsletter!", ago: 10 },
    { channel: channelIds["client-updates"], author: USER_IDS.owner, body: "Wayne Enterprises initial discovery meeting is scheduled for next Monday.", ago: 6 },
  ];

  for (const msg of chatMessages) {
    await pool.query(`
      INSERT INTO chat_messages (id, tenant_id, channel_id, author_user_id, body, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), TENANT_ID, msg.channel, msg.author, msg.body, hoursAgo(msg.ago)]);
  }

  // ── 4. DM Threads ────────────────────────────────────────────────────
  console.log("✉️ Creating DM threads...");
  const dmPairs = [
    { users: [USER_IDS.owner, USER_IDS.sarah], messages: [
      { author: USER_IDS.owner, body: "Sarah, can you send me the latest brand deck? I need it for the client meeting.", ago: 20 },
      { author: USER_IDS.sarah, body: "Sure! Just shared it on Google Drive. Check your email.", ago: 19.5 },
      { author: USER_IDS.owner, body: "Got it, thanks! The color scheme looks perfect.", ago: 19 },
      { author: USER_IDS.sarah, body: "Also, I think we should adjust the typography scale for mobile.", ago: 10 },
      { author: USER_IDS.owner, body: "Good call. Let's discuss in tomorrow's design review.", ago: 9 },
    ]},
    { users: [USER_IDS.mike, USER_IDS.james], messages: [
      { author: USER_IDS.mike, body: "Hey James, can you help me debug the WebSocket reconnection issue?", ago: 30 },
      { author: USER_IDS.james, body: "Sure, what's happening? Is it the heartbeat timeout?", ago: 29 },
      { author: USER_IDS.mike, body: "Yeah, clients are disconnecting after exactly 60 seconds idle.", ago: 28 },
      { author: USER_IDS.james, body: "That's the default nginx proxy timeout. We need to configure the upstream keep-alive.", ago: 27 },
      { author: USER_IDS.mike, body: "Fixed it! Thanks for the tip. Increasing keepalive to 300s did the trick.", ago: 24 },
      { author: USER_IDS.james, body: "Nice! Also, I found a memory leak in the event listener cleanup. PR incoming.", ago: 8 },
    ]},
    { users: [USER_IDS.owner, USER_IDS.mike], messages: [
      { author: USER_IDS.owner, body: "Mike, how's the API integration going? Client is asking for an ETA.", ago: 15 },
      { author: USER_IDS.mike, body: "Core endpoints are done. Working on error handling and rate limiting now.", ago: 14 },
      { author: USER_IDS.owner, body: "Great. Can we have a demo ready by Thursday?", ago: 13 },
      { author: USER_IDS.mike, body: "Absolutely. I'll have the staging environment set up by Wednesday night.", ago: 12 },
    ]},
    { users: [USER_IDS.emma, USER_IDS.lisa], messages: [
      { author: USER_IDS.emma, body: "Lisa, I need the marketing copy for the landing page hero section.", ago: 18 },
      { author: USER_IDS.lisa, body: "Working on it now! Should have it ready in about an hour.", ago: 17 },
      { author: USER_IDS.lisa, body: "Here's the draft: \"Transform your workflow with intelligent project management.\"", ago: 16 },
      { author: USER_IDS.emma, body: "Love it! I'll incorporate it into the design right away.", ago: 15 },
    ]},
  ];

  for (const dm of dmPairs) {
    const threadId = randomUUID();
    await pool.query(`
      INSERT INTO chat_dm_threads (id, tenant_id, created_at)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
    `, [threadId, TENANT_ID, daysAgo(30)]);

    for (const userId of dm.users) {
      await pool.query(`
        INSERT INTO chat_dm_members (id, tenant_id, dm_thread_id, user_id, created_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [randomUUID(), TENANT_ID, threadId, userId, daysAgo(30)]);
    }

    for (const msg of dm.messages) {
      await pool.query(`
        INSERT INTO chat_messages (id, tenant_id, dm_thread_id, author_user_id, body, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING
      `, [randomUUID(), TENANT_ID, threadId, msg.author, msg.body, hoursAgo(msg.ago)]);
    }
  }

  // ── 5. Client Note Categories ─────────────────────────────────────────
  console.log("🏷️ Creating client note categories...");
  const noteCategoryDefs = [
    { key: "general", name: "General", color: "#6366f1", isSystem: true },
    { key: "meeting", name: "Meeting Notes", color: "#3b82f6", isSystem: false },
    { key: "feedback", name: "Client Feedback", color: "#10b981", isSystem: false },
    { key: "internal", name: "Internal", color: "#f59e0b", isSystem: false },
    { key: "strategy", name: "Strategy", color: "#8b5cf6", isSystem: false },
  ];

  const noteCatIds: Record<string, string> = {};
  for (const cat of noteCategoryDefs) {
    const existing = await pool.query(`SELECT id FROM client_note_categories WHERE tenant_id = $1 AND name = $2`, [TENANT_ID, cat.name]);
    if (existing.rows.length > 0) {
      noteCatIds[cat.key] = existing.rows[0].id;
    } else {
      const newId = randomUUID();
      await pool.query(`
        INSERT INTO client_note_categories (id, tenant_id, name, color, is_system, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $6)
      `, [newId, TENANT_ID, cat.name, cat.color, cat.isSystem, daysAgo(60)]);
      noteCatIds[cat.key] = newId;
    }
  }

  // ── 6. Client Notes ───────────────────────────────────────────────────
  console.log("📝 Creating client notes...");
  const clientNotes = [
    { clientId: CLIENT_IDS.acme, author: USER_IDS.owner, body: "Kickoff meeting went well. Key stakeholders: John (CTO), Maria (VP Product). They want a modern, scalable platform that integrates with their existing CRM. Budget approved for Phase 1 ($150K). Timeline: 6 months.", catId: noteCatIds.meeting, ago: 45 },
    { clientId: CLIENT_IDS.acme, author: USER_IDS.sarah, body: "Design review session: Client loves the minimalist approach. They want to keep the color palette professional — blues and grays. Requested a dashboard widget for real-time analytics. Need to follow up on brand guidelines document.", catId: noteCatIds.meeting, ago: 30 },
    { clientId: CLIENT_IDS.acme, author: USER_IDS.owner, body: "Acme is a VIP client — high revenue potential. They're exploring expanding to 3 new markets in Q3. We should position ourselves for the digital transformation work.", catId: noteCatIds.strategy, ago: 20 },
    { clientId: CLIENT_IDS.acme, author: USER_IDS.mike, body: "Technical assessment complete. Their API infrastructure needs modernization. Recommending a microservices migration path. Current monolith can't handle their growth projections.", catId: noteCatIds.internal, ago: 15 },
    { clientId: CLIENT_IDS.acme, author: USER_IDS.emma, body: "Client feedback on mockups was very positive. They specifically called out the navigation improvements and the onboarding flow. Minor revision needed on the settings page layout.", catId: noteCatIds.feedback, ago: 5 },

    { clientId: CLIENT_IDS.globex, author: USER_IDS.sarah, body: "Initial discovery call with Globex. They need a complete brand overhaul — logo, website, marketing collateral. Current branding feels dated. Budget flexible, but they want a phased approach.", catId: noteCatIds.meeting, ago: 40 },
    { clientId: CLIENT_IDS.globex, author: USER_IDS.lisa, body: "Market research indicates Globex's competitors have much stronger digital presence. Recommend aggressive content strategy alongside the rebrand.", catId: noteCatIds.strategy, ago: 25 },
    { clientId: CLIENT_IDS.globex, author: USER_IDS.sarah, body: "Presented 3 logo concepts. Client gravitating toward Concept B (the geometric approach). Want to see it with different color variations.", catId: noteCatIds.feedback, ago: 10 },

    { clientId: CLIENT_IDS.initech, author: USER_IDS.mike, body: "Initech wants to build a customer-facing API. They have 200+ enterprise clients who need programmatic access. Performance and security are top priorities.", catId: noteCatIds.meeting, ago: 35 },
    { clientId: CLIENT_IDS.initech, author: USER_IDS.james, body: "Architecture proposal drafted. Recommending REST + GraphQL hybrid approach with OAuth2 authentication. Rate limiting at 1000 req/min per client.", catId: noteCatIds.internal, ago: 28 },
    { clientId: CLIENT_IDS.initech, author: USER_IDS.mike, body: "Client is impressed with our technical proposal. They want to fast-track Phase 1 to launch before their annual conference in August.", catId: noteCatIds.feedback, ago: 12 },

    { clientId: CLIENT_IDS.umbrella, author: USER_IDS.owner, body: "Umbrella Health is a prospect with huge potential. They're a healthcare startup with Series B funding ($25M). Need HIPAA-compliant patient portal.", catId: noteCatIds.strategy, ago: 50 },
    { clientId: CLIENT_IDS.umbrella, author: USER_IDS.lisa, body: "Sent Umbrella the case study deck highlighting our healthcare experience. They responded positively and want to schedule a deeper technical discussion.", catId: noteCatIds.general, ago: 30 },

    { clientId: CLIENT_IDS.wayne, author: USER_IDS.owner, body: "Wayne Enterprises reached out through our website. They're a financial services firm looking for a custom reporting dashboard. Decision maker: Bruce W., CFO.", catId: noteCatIds.general, ago: 15 },
    { clientId: CLIENT_IDS.wayne, author: USER_IDS.sarah, body: "Prepared a pitch deck tailored to financial services. Emphasizing our data visualization expertise and compliance experience.", catId: noteCatIds.strategy, ago: 8 },
  ];

  for (const n of clientNotes) {
    await pool.query(`
      INSERT INTO client_notes (id, tenant_id, client_id, author_user_id, body, category_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), TENANT_ID, n.clientId, n.author, JSON.stringify(toTipTapDoc(n.body)), n.catId, daysAgo(n.ago)]);
  }

  // ── 7. Client Conversations & Messages (Portal) ──────────────────────
  console.log("🗣️ Creating client conversations and messages...");
  const conversations = [
    {
      clientId: CLIENT_IDS.acme, subject: "Website Redesign - Phase 1 Updates", createdBy: USER_IDS.owner, projectId: PROJECT_IDS.websiteRedesign,
      messages: [
        { author: USER_IDS.owner, body: "Hi team, here's the latest progress update on the website redesign. We've completed the homepage and about page designs. Please review and let us know your thoughts.", visibility: "client_visible", ago: 20 },
        { author: USER_IDS.sarah, body: "I've attached the latest mockups to the project folder. The navigation structure has been simplified based on our last discussion.", visibility: "client_visible", ago: 18 },
        { author: USER_IDS.owner, body: "Internal note: Client seems very engaged. Let's make sure we over-deliver on this phase.", visibility: "internal", ago: 17 },
        { author: USER_IDS.emma, body: "The responsive designs are ready. We've tested across all major breakpoints — desktop, tablet, and mobile.", visibility: "client_visible", ago: 10 },
        { author: USER_IDS.owner, body: "Great progress! The client meeting is next Tuesday. Let's have everything polished by Monday.", visibility: "client_visible", ago: 5 },
      ]
    },
    {
      clientId: CLIENT_IDS.acme, subject: "API Integration Requirements", createdBy: USER_IDS.mike, projectId: PROJECT_IDS.apiIntegration,
      messages: [
        { author: USER_IDS.mike, body: "We need to finalize the API integration specs. Could you share the documentation for your current system?", visibility: "client_visible", ago: 15 },
        { author: USER_IDS.james, body: "I've drafted the integration architecture diagram. It covers authentication, data sync, and webhook notifications.", visibility: "client_visible", ago: 12 },
        { author: USER_IDS.mike, body: "Internal: Need to check if their API supports batch operations. This could significantly impact our approach.", visibility: "internal", ago: 11 },
      ]
    },
    {
      clientId: CLIENT_IDS.globex, subject: "Brand Refresh - Logo Options", createdBy: USER_IDS.sarah, projectId: PROJECT_IDS.brandRefresh,
      messages: [
        { author: USER_IDS.sarah, body: "Here are the three logo concepts we discussed. Each comes with a full brand application preview.", visibility: "client_visible", ago: 25 },
        { author: USER_IDS.emma, body: "I've also prepared color palette variations for each concept. Let us know which direction resonates most.", visibility: "client_visible", ago: 23 },
        { author: USER_IDS.sarah, body: "Following up — have you had a chance to review the logo options? We'd love to hear your feedback.", visibility: "client_visible", ago: 14 },
        { author: USER_IDS.sarah, body: "Internal: Client has been slow to respond. Let's check in via phone call.", visibility: "internal", ago: 13 },
      ]
    },
    {
      clientId: CLIENT_IDS.initech, subject: "Mobile App Development Kickoff", createdBy: USER_IDS.owner, projectId: PROJECT_IDS.mobileApp,
      messages: [
        { author: USER_IDS.owner, body: "Welcome to the project! Here's the development timeline and milestone breakdown. Let's discuss any questions in our first standup.", visibility: "client_visible", ago: 30 },
        { author: USER_IDS.mike, body: "Technical stack confirmed: React Native for cross-platform support. This aligns with your existing web infrastructure.", visibility: "client_visible", ago: 28 },
        { author: USER_IDS.james, body: "CI/CD pipeline is set up. We'll have automatic builds for both iOS and Android with each PR merge.", visibility: "client_visible", ago: 22 },
      ]
    },
    {
      clientId: CLIENT_IDS.umbrella, subject: "Initial Consultation - Patient Portal", createdBy: USER_IDS.owner, projectId: null,
      messages: [
        { author: USER_IDS.owner, body: "Thank you for your interest in Bright Studio! I'd love to learn more about your patient portal needs and how we can help.", visibility: "client_visible", ago: 40 },
        { author: USER_IDS.owner, body: "Internal: This is a high-value prospect. Healthcare is a growth area for us. Let's prepare a detailed proposal.", visibility: "internal", ago: 39 },
      ]
    },
  ];

  for (const conv of conversations) {
    const convId = randomUUID();
    await pool.query(`
      INSERT INTO client_conversations (id, tenant_id, client_id, project_id, subject, created_by_user_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
      ON CONFLICT DO NOTHING
    `, [convId, TENANT_ID, conv.clientId, conv.projectId, conv.subject, conv.createdBy, daysAgo(conv.messages[0].ago + 1)]);

    for (const msg of conv.messages) {
      await pool.query(`
        INSERT INTO client_messages (id, tenant_id, conversation_id, author_user_id, body_text, visibility, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT DO NOTHING
      `, [randomUUID(), TENANT_ID, convId, msg.author, msg.body, msg.visibility, daysAgo(msg.ago)]);
    }
  }

  // ── 8. Support Tickets & Messages ─────────────────────────────────────
  console.log("🎫 Creating support tickets...");
  const tickets = [
    {
      clientId: CLIENT_IDS.acme, title: "Login page not loading on mobile", status: "open", priority: "high", category: "bug",
      createdBy: USER_IDS.owner, assignedTo: USER_IDS.mike, ago: 3,
      messages: [
        { author: USER_IDS.owner, body: "The client reports that the login page shows a blank screen on iOS Safari. This is affecting their team's ability to access the portal.", authorType: "tenant_user", ago: 3 },
        { author: USER_IDS.mike, body: "I've identified the issue — it's a CSS flexbox rendering bug in Safari 16. Working on a fix now.", authorType: "tenant_user", ago: 2.5 },
        { author: USER_IDS.mike, body: "Fix deployed to staging. Can you verify with the client?", authorType: "tenant_user", ago: 2 },
      ]
    },
    {
      clientId: CLIENT_IDS.acme, title: "Request for custom report export", status: "in_progress", priority: "medium", category: "feature_request",
      createdBy: USER_IDS.owner, assignedTo: USER_IDS.james, ago: 7,
      messages: [
        { author: USER_IDS.owner, body: "The client would like to export their project reports as PDF with custom branding (their logo and colors).", authorType: "tenant_user", ago: 7 },
        { author: USER_IDS.james, body: "This is feasible. I'll add it to the next sprint. Estimated delivery: 2 weeks.", authorType: "tenant_user", ago: 6 },
      ]
    },
    {
      clientId: CLIENT_IDS.globex, title: "File upload failing for large files", status: "resolved", priority: "high", category: "bug",
      createdBy: USER_IDS.sarah, assignedTo: USER_IDS.mike, ago: 14,
      messages: [
        { author: USER_IDS.sarah, body: "Globex can't upload files larger than 10MB. They're getting a timeout error.", authorType: "tenant_user", ago: 14 },
        { author: USER_IDS.mike, body: "Found the issue — the upload limit was set too low on the server. Increasing to 50MB.", authorType: "tenant_user", ago: 13 },
        { author: USER_IDS.mike, body: "Fixed and deployed. Large file uploads are working now.", authorType: "tenant_user", ago: 12 },
        { author: USER_IDS.sarah, body: "Confirmed with the client. Everything is working. Thanks Mike!", authorType: "tenant_user", ago: 11 },
      ]
    },
    {
      clientId: CLIENT_IDS.initech, title: "API rate limiting configuration", status: "open", priority: "low", category: "question",
      createdBy: USER_IDS.mike, assignedTo: USER_IDS.james, ago: 5,
      messages: [
        { author: USER_IDS.mike, body: "Initech is asking about increasing their API rate limits for the batch import feature.", authorType: "tenant_user", ago: 5 },
        { author: USER_IDS.james, body: "We can configure per-endpoint rate limits. Let me draft a proposal for tiered limits.", authorType: "tenant_user", ago: 4 },
      ]
    },
    {
      clientId: CLIENT_IDS.umbrella, title: "HIPAA compliance documentation request", status: "open", priority: "medium", category: "question",
      createdBy: USER_IDS.owner, assignedTo: null, ago: 8,
      messages: [
        { author: USER_IDS.owner, body: "Umbrella Health needs our HIPAA compliance documentation and BAA before they can proceed with the project.", authorType: "tenant_user", ago: 8 },
      ]
    },
  ];

  for (const ticket of tickets) {
    const ticketId = randomUUID();
    const resolvedAt = ticket.status === "resolved" ? daysAgo(ticket.ago - 3) : null;
    await pool.query(`
      INSERT INTO support_tickets (id, tenant_id, client_id, created_by_user_id, title, description, status, priority, category, source, assigned_to_user_id, resolved_at, created_at, updated_at, last_activity_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'internal', $10, $11, $12, $12, $12)
      ON CONFLICT DO NOTHING
    `, [ticketId, TENANT_ID, ticket.clientId, ticket.createdBy, ticket.title, ticket.messages[0].body, ticket.status, ticket.priority, ticket.category, ticket.assignedTo, resolvedAt, daysAgo(ticket.ago)]);

    for (const msg of ticket.messages) {
      await pool.query(`
        INSERT INTO support_ticket_messages (id, tenant_id, ticket_id, author_type, author_user_id, body_text, visibility, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'public', $7, $7)
        ON CONFLICT DO NOTHING
      `, [randomUUID(), TENANT_ID, ticketId, msg.authorType, msg.author, msg.body, daysAgo(msg.ago)]);
    }
  }

  // ── 9. Project Notes ──────────────────────────────────────────────────
  console.log("📓 Creating project notes...");
  const projectNotes = [
    { projectId: PROJECT_IDS.websiteRedesign, author: USER_IDS.sarah, body: "Design system tokens finalized:\n- Primary: #3B82F6\n- Secondary: #6366F1\n- Accent: #F59E0B\n- Typography: Inter for headings, system font stack for body\n- Spacing scale: 4px base unit", category: "design", ago: 30 },
    { projectId: PROJECT_IDS.websiteRedesign, author: USER_IDS.mike, body: "Technical architecture decisions:\n- Next.js 14 with App Router\n- Tailwind CSS for styling\n- PostgreSQL + Drizzle ORM\n- Vercel for hosting\n- Cloudflare R2 for asset storage", category: "technical", ago: 28 },
    { projectId: PROJECT_IDS.websiteRedesign, author: USER_IDS.owner, body: "Sprint retrospective notes:\n- What went well: Team collaboration, client communication\n- What to improve: Estimation accuracy, deployment pipeline speed\n- Action items: Set up staging environment, create deployment checklist", category: "meeting", ago: 14 },
    { projectId: PROJECT_IDS.mobileApp, author: USER_IDS.mike, body: "React Native setup checklist:\n✅ Expo managed workflow configured\n✅ Navigation (React Navigation v6)\n✅ State management (Zustand)\n✅ API client (Axios + React Query)\n⬜ Push notifications\n⬜ Deep linking\n⬜ Analytics SDK", category: "technical", ago: 25 },
    { projectId: PROJECT_IDS.mobileApp, author: USER_IDS.james, body: "Performance benchmarks after optimization:\n- Cold start: 1.2s → 0.8s (-33%)\n- List scroll: 55fps → 60fps\n- Memory usage: 180MB → 145MB\n- Bundle size: 12MB → 9.5MB", category: "technical", ago: 10 },
    { projectId: PROJECT_IDS.brandRefresh, author: USER_IDS.sarah, body: "Competitive analysis summary:\n- Competitor A: Modern, minimalist, strong digital presence\n- Competitor B: Traditional, corporate, weak mobile experience\n- Competitor C: Bold, colorful, strong social media\n\nRecommendation: Position Globex between modern and professional. Avoid being too trendy.", category: "research", ago: 35 },
    { projectId: PROJECT_IDS.apiIntegration, author: USER_IDS.james, body: "API documentation structure:\n1. Authentication (OAuth2 + API Keys)\n2. REST Endpoints (CRUD operations)\n3. Webhooks (event subscriptions)\n4. Rate Limits (tiered by plan)\n5. Error Codes (standardized format)\n6. SDKs (JavaScript, Python, Ruby)", category: "technical", ago: 20 },
    { projectId: PROJECT_IDS.marketingCampaign, author: USER_IDS.lisa, body: "Campaign performance metrics (Week 1):\n- Email open rate: 28.5% (industry avg: 21%)\n- Click-through rate: 4.2%\n- Social engagement: +340% vs baseline\n- Landing page conversion: 3.8%\n- Total leads generated: 47", category: "metrics", ago: 7 },
    { projectId: PROJECT_IDS.dataAnalytics, author: USER_IDS.james, body: "Dashboard widget requirements:\n1. Revenue trend chart (line, 12-month rolling)\n2. Client acquisition funnel (funnel chart)\n3. Team utilization heatmap\n4. Project health scorecard\n5. Budget vs. actual comparison (bar chart)\n6. Real-time activity feed", category: "requirements", ago: 15 },
  ];

  for (const n of projectNotes) {
    await pool.query(`
      INSERT INTO project_notes (id, tenant_id, project_id, author_user_id, body, category, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), TENANT_ID, n.projectId, n.author, JSON.stringify(toTipTapDoc(n.body)), n.category, daysAgo(n.ago)]);
  }

  // ── 10. Activity Log ──────────────────────────────────────────────────
  console.log("📊 Creating activity log entries...");
  const activities = [
    { actor: USER_IDS.owner, entityType: "project", entityId: PROJECT_IDS.websiteRedesign, action: "created", ago: 60 },
    { actor: USER_IDS.sarah, entityType: "task", entityId: taskIds[0], action: "status_changed", diff: { from: "todo", to: "in_progress" }, ago: 30 },
    { actor: USER_IDS.mike, entityType: "task", entityId: taskIds[1], action: "assigned", diff: { assignee: "James Park" }, ago: 28 },
    { actor: USER_IDS.emma, entityType: "task", entityId: taskIds[2], action: "completed", ago: 25 },
    { actor: USER_IDS.owner, entityType: "project", entityId: PROJECT_IDS.mobileApp, action: "created", ago: 45 },
    { actor: USER_IDS.james, entityType: "task", entityId: taskIds[5], action: "comment_added", ago: 20 },
    { actor: USER_IDS.lisa, entityType: "client", entityId: CLIENT_IDS.acme, action: "note_added", ago: 18 },
    { actor: USER_IDS.mike, entityType: "task", entityId: taskIds[3], action: "priority_changed", diff: { from: "medium", to: "high" }, ago: 15 },
    { actor: USER_IDS.sarah, entityType: "project", entityId: PROJECT_IDS.brandRefresh, action: "milestone_reached", diff: { milestone: "Logo concepts approved" }, ago: 12 },
    { actor: USER_IDS.owner, entityType: "client", entityId: CLIENT_IDS.globex, action: "stage_changed", diff: { from: "lead", to: "active" }, ago: 10 },
    { actor: USER_IDS.emma, entityType: "task", entityId: taskIds[4], action: "attachment_added", ago: 8 },
    { actor: USER_IDS.james, entityType: "task", entityId: taskIds[6], action: "time_logged", diff: { hours: 3.5 }, ago: 5 },
    { actor: USER_IDS.mike, entityType: "project", entityId: PROJECT_IDS.apiIntegration, action: "status_changed", diff: { from: "planning", to: "in_progress" }, ago: 3 },
    { actor: USER_IDS.lisa, entityType: "project", entityId: PROJECT_IDS.marketingCampaign, action: "budget_updated", diff: { from: 25000, to: 30000 }, ago: 2 },
    { actor: USER_IDS.owner, entityType: "task", entityId: taskIds[0], action: "due_date_changed", diff: { from: "2026-03-01", to: "2026-03-15" }, ago: 1 },
  ];

  for (const a of activities) {
    await pool.query(`
      INSERT INTO activity_log (id, workspace_id, actor_user_id, entity_type, entity_id, action, diff_json, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), WORKSPACE_ID, a.actor, a.entityType, a.entityId, a.action, a.diff ? JSON.stringify(a.diff) : null, daysAgo(a.ago)]);
  }

  // ── 11. Notifications ─────────────────────────────────────────────────
  console.log("🔔 Creating notifications...");
  const notifs = [
    { user: USER_IDS.owner, type: "task_assigned", title: "New task assigned", message: "You've been assigned to \"Performance optimization\"", severity: "info", entityType: "task", entityId: taskIds[0], href: `/projects/${PROJECT_IDS.websiteRedesign}`, ago: 5 },
    { user: USER_IDS.owner, type: "comment_mention", title: "Mentioned in a comment", message: "Sarah mentioned you in a comment on \"Design homepage mockups\"", severity: "info", entityType: "task", entityId: taskIds[1], href: `/projects/${PROJECT_IDS.websiteRedesign}`, ago: 3 },
    { user: USER_IDS.owner, type: "task_completed", title: "Task completed", message: "Emma completed \"Create component library\"", severity: "info", entityType: "task", entityId: taskIds[2], href: `/projects/${PROJECT_IDS.websiteRedesign}`, ago: 2 },
    { user: USER_IDS.owner, type: "chat_message", title: "New message in #general", message: "Mike: Just deployed the latest build to staging.", severity: "info", entityType: "chat_channel", entityId: channelIds["general"], href: "/chat", ago: 1 },
    { user: USER_IDS.sarah, type: "task_assigned", title: "New task assigned", message: "You've been assigned to \"Design app wireframes\"", severity: "info", entityType: "task", entityId: taskIds[3], href: `/projects/${PROJECT_IDS.mobileApp}`, ago: 4 },
    { user: USER_IDS.sarah, type: "support_ticket", title: "New support ticket", message: "Login page not loading on mobile (Acme Corporation)", severity: "warning", entityType: "support_ticket", entityId: "ticket", href: "/support", ago: 3 },
    { user: USER_IDS.mike, type: "task_due_soon", title: "Task due tomorrow", message: "\"Build responsive navigation\" is due tomorrow", severity: "warning", entityType: "task", entityId: taskIds[1], href: `/projects/${PROJECT_IDS.websiteRedesign}`, ago: 1 },
    { user: USER_IDS.mike, type: "comment_mention", title: "Mentioned in a comment", message: "Alex mentioned you in a comment on API integration", severity: "info", entityType: "task", entityId: taskIds[4], href: `/projects/${PROJECT_IDS.apiIntegration}`, ago: 2 },
    { user: USER_IDS.emma, type: "task_assigned", title: "New task assigned", message: "You've been assigned to \"Build icon set\"", severity: "info", entityType: "task", entityId: taskIds[2], href: `/projects/${PROJECT_IDS.websiteRedesign}`, ago: 6 },
    { user: USER_IDS.james, type: "client_message", title: "New client message", message: "New message in Acme Corporation conversation", severity: "info", entityType: "client_conversation", entityId: "conv", href: `/clients/${CLIENT_IDS.acme}`, ago: 4 },
    { user: USER_IDS.james, type: "task_overdue", title: "Task overdue", message: "\"API endpoint testing\" is past its due date", severity: "urgent", entityType: "task", entityId: taskIds[5], href: `/projects/${PROJECT_IDS.apiIntegration}`, ago: 1 },
    { user: USER_IDS.lisa, type: "task_completed", title: "Task completed", message: "Campaign metrics report has been completed", severity: "info", entityType: "task", entityId: taskIds[6], href: `/projects/${PROJECT_IDS.marketingCampaign}`, ago: 2 },
  ];

  for (const n of notifs) {
    await pool.query(`
      INSERT INTO notifications (id, user_id, type, title, message, severity, entity_type, entity_id, href, tenant_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), n.user, n.type, n.title, n.message, n.severity, n.entityType, n.entityId, n.href, TENANT_ID, daysAgo(n.ago)]);
  }

  // ── 12. Tenant-Level Notes ────────────────────────────────────────────
  console.log("📋 Creating tenant notes...");
  const tenantNotes = [
    { author: USER_IDS.owner, body: "Q1 2026 Goals:\n1. Increase client retention to 95%\n2. Launch 3 new service offerings\n3. Hire 2 senior developers\n4. Achieve $500K MRR\n5. Complete SOC 2 certification", category: "strategy", ago: 60 },
    { author: USER_IDS.owner, body: "Team standup format:\n- What did you accomplish yesterday?\n- What are you working on today?\n- Any blockers?\n- Keep it under 15 minutes", category: "process", ago: 45 },
    { author: USER_IDS.sarah, body: "Design system versioning policy:\n- Major versions: Breaking changes to components\n- Minor versions: New components or features\n- Patch versions: Bug fixes and refinements\n- All changes documented in changelog", category: "design", ago: 30 },
    { author: USER_IDS.mike, body: "Deployment checklist:\n1. Run full test suite\n2. Check for pending migrations\n3. Verify environment variables\n4. Create database backup\n5. Deploy to staging first\n6. Smoke test critical paths\n7. Deploy to production\n8. Monitor error rates for 30 min", category: "engineering", ago: 20 },
    { author: USER_IDS.lisa, body: "Content calendar for March 2026:\n- Week 1: Blog post on design systems\n- Week 2: Case study: Acme Corp project\n- Week 3: Newsletter + social campaign\n- Week 4: Webinar: Remote team productivity", category: "marketing", ago: 10 },
  ];

  for (const n of tenantNotes) {
    await pool.query(`
      INSERT INTO tenant_notes (id, tenant_id, author_user_id, body, category, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $6)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), TENANT_ID, n.author, n.body, n.category, daysAgo(n.ago)]);
  }

  // ── 13. Additional Time Entries ───────────────────────────────────────
  console.log("⏱️ Creating additional time entries...");
  const recentTimeEntries = [
    { user: USER_IDS.sarah, project: PROJECT_IDS.websiteRedesign, client: CLIENT_IDS.acme, title: "Design review and feedback session", hours: 2, ago: 1 },
    { user: USER_IDS.sarah, project: PROJECT_IDS.brandRefresh, client: CLIENT_IDS.globex, title: "Logo concept refinements", hours: 3.5, ago: 1 },
    { user: USER_IDS.mike, project: PROJECT_IDS.websiteRedesign, client: CLIENT_IDS.acme, title: "Frontend performance optimization", hours: 4, ago: 1 },
    { user: USER_IDS.mike, project: PROJECT_IDS.apiIntegration, client: CLIENT_IDS.initech, title: "API endpoint development", hours: 5, ago: 0.5 },
    { user: USER_IDS.emma, project: PROJECT_IDS.websiteRedesign, client: CLIENT_IDS.acme, title: "Component library documentation", hours: 2.5, ago: 1 },
    { user: USER_IDS.emma, project: PROJECT_IDS.mobileApp, client: CLIENT_IDS.initech, title: "Mobile UI design iterations", hours: 3, ago: 0.5 },
    { user: USER_IDS.james, project: PROJECT_IDS.apiIntegration, client: CLIENT_IDS.initech, title: "Database migration scripting", hours: 4.5, ago: 1 },
    { user: USER_IDS.james, project: PROJECT_IDS.dataAnalytics, client: CLIENT_IDS.wayne, title: "Dashboard widget development", hours: 3, ago: 0.5 },
    { user: USER_IDS.lisa, project: PROJECT_IDS.marketingCampaign, client: CLIENT_IDS.globex, title: "Social media content creation", hours: 2, ago: 1 },
    { user: USER_IDS.lisa, project: PROJECT_IDS.marketingCampaign, client: CLIENT_IDS.globex, title: "Email campaign analytics review", hours: 1.5, ago: 0.5 },
    { user: USER_IDS.owner, project: PROJECT_IDS.websiteRedesign, client: CLIENT_IDS.acme, title: "Client status meeting", hours: 1, ago: 1 },
    { user: USER_IDS.owner, project: PROJECT_IDS.brandRefresh, client: CLIENT_IDS.globex, title: "Brand strategy planning", hours: 2, ago: 0.5 },
  ];

  for (const te of recentTimeEntries) {
    const startTime = daysAgo(te.ago);
    const endTime = new Date(startTime.getTime() + te.hours * 3600000);
    const taskId = taskIds[Math.floor(Math.random() * taskIds.length)];
    await pool.query(`
      INSERT INTO time_entries (id, workspace_id, user_id, client_id, project_id, task_id, title, description, scope, start_time, end_time, duration_seconds, is_manual, tenant_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'task', $9, $10, $11, true, $12, $13, $13)
      ON CONFLICT DO NOTHING
    `, [randomUUID(), WORKSPACE_ID, te.user, te.client, te.project, taskId, te.title, te.title, startTime, endTime, te.hours * 3600, TENANT_ID, startTime]);
  }

  // ── 14. Client CRM entries ────────────────────────────────────────────
  console.log("💼 Creating CRM entries...");
  const crmEntries = [
    { clientId: CLIENT_IDS.acme, status: "active", ownerUser: USER_IDS.owner, tags: ["VIP", "enterprise"], lastContact: daysAgo(2), nextFollowup: daysAgo(-7), followupNotes: "Review Phase 2 proposal with John" },
    { clientId: CLIENT_IDS.globex, status: "active", ownerUser: USER_IDS.sarah, tags: ["rebrand"], lastContact: daysAgo(5), nextFollowup: daysAgo(-3), followupNotes: "Follow up on logo selection" },
    { clientId: CLIENT_IDS.initech, status: "active", ownerUser: USER_IDS.mike, tags: ["api", "enterprise"], lastContact: daysAgo(3), nextFollowup: daysAgo(-14), followupNotes: "Check in on API launch timeline" },
    { clientId: CLIENT_IDS.umbrella, status: "prospect", ownerUser: USER_IDS.owner, tags: ["healthcare", "high-value"], lastContact: daysAgo(10), nextFollowup: daysAgo(-5), followupNotes: "Send HIPAA compliance docs" },
    { clientId: CLIENT_IDS.wayne, status: "lead", ownerUser: USER_IDS.owner, tags: ["finance"], lastContact: daysAgo(8), nextFollowup: daysAgo(-2), followupNotes: "Schedule discovery meeting" },
  ];

  for (const crm of crmEntries) {
    await pool.query(`
      INSERT INTO client_crm (client_id, tenant_id, status, owner_user_id, tags, last_contact_at, next_follow_up_at, follow_up_notes, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
      ON CONFLICT (client_id) DO UPDATE SET
        status = EXCLUDED.status,
        owner_user_id = EXCLUDED.owner_user_id,
        tags = EXCLUDED.tags,
        last_contact_at = EXCLUDED.last_contact_at,
        next_follow_up_at = EXCLUDED.next_follow_up_at,
        follow_up_notes = EXCLUDED.follow_up_notes,
        updated_at = EXCLUDED.updated_at
    `, [crm.clientId, TENANT_ID, crm.status, crm.ownerUser, crm.tags, crm.lastContact, crm.nextFollowup, crm.followupNotes, daysAgo(30)]);
  }

  // ── 15. Client Stage History ──────────────────────────────────────────
  console.log("📈 Creating client stage history...");
  const stageHistories = [
    { clientId: CLIENT_IDS.acme, transitions: [
      { from: "lead", to: "prospect", ago: 55 },
      { from: "prospect", to: "proposal", ago: 45 },
      { from: "proposal", to: "active", ago: 30 },
    ]},
    { clientId: CLIENT_IDS.globex, transitions: [
      { from: "lead", to: "prospect", ago: 50 },
      { from: "prospect", to: "active", ago: 35 },
    ]},
    { clientId: CLIENT_IDS.initech, transitions: [
      { from: "lead", to: "active", ago: 40 },
    ]},
  ];

  for (const sh of stageHistories) {
    for (const t of sh.transitions) {
      await pool.query(`
        INSERT INTO client_stage_history (id, tenant_id, client_id, from_stage, to_stage, changed_by_user_id, changed_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT DO NOTHING
      `, [randomUUID(), TENANT_ID, sh.clientId, t.from, t.to, USER_IDS.owner, daysAgo(t.ago)]);
    }
  }

  console.log("\n✅ Sample data seeding complete!");
  console.log("  - 20 task comments");
  console.log("  - 19 subtasks across 5 tasks");
  console.log("  - 5 chat channels with 42 messages");
  console.log("  - 4 DM threads with 19 messages");
  console.log("  - 5 client note categories");
  console.log("  - 15 client notes");
  console.log("  - 5 client conversations with 17 messages");
  console.log("  - 5 support tickets with 12 messages");
  console.log("  - 9 project notes");
  console.log("  - 15 activity log entries");
  console.log("  - 12 notifications");
  console.log("  - 5 tenant notes");
  console.log("  - 12 additional time entries");
  console.log("  - 5 CRM entries");
  console.log("  - 6 client stage history records");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
