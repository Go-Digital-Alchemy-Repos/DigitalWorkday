import { Router } from "express";

const router = Router();

function htmlPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 760px; margin: 48px auto; padding: 0 20px; line-height: 1.6; color: #172033; }
    h1 { font-size: 28px; line-height: 1.2; }
    h2 { font-size: 18px; margin-top: 28px; }
    a { color: #0f766e; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

router.get("/privacy", (_req, res) => {
  res
    .type("html")
    .send(htmlPage("Digital Workday QuickBooks Privacy Policy", `
      <h1>Digital Workday QuickBooks Privacy Policy</h1>
      <p>Digital Workday uses the QuickBooks Online API for private, internal accounting workflow access only.</p>
      <h2>Data Access</h2>
      <p>The integration can access QuickBooks Online accounting data authorized by the connected company, using the Accounting API scope.</p>
      <h2>Data Use</h2>
      <p>QuickBooks data is used only inside Digital Workday to support the connected company owner's accounting and operations workflows. Digital Workday does not sell QuickBooks data or provide this private integration for third-party SaaS access.</p>
      <h2>Credentials</h2>
      <p>OAuth credentials and tokens are stored encrypted by Digital Workday server-side configuration and are not shown back to users after entry.</p>
      <h2>Disconnecting</h2>
      <p>The connection can be removed from Digital Workday settings or from QuickBooks Online app management.</p>
      <h2>Contact</h2>
      <p>For questions about this private integration, contact the Digital Workday administrator.</p>
    `));
});

router.get("/eula", (_req, res) => {
  res
    .type("html")
    .send(htmlPage("Digital Workday QuickBooks Terms", `
      <h1>Digital Workday QuickBooks Terms</h1>
      <p>This QuickBooks Online integration is provided for private, internal use by the Digital Workday owner and authorized administrators.</p>
      <h2>Permitted Use</h2>
      <p>The integration may be used only to connect the owner's QuickBooks Online company to Digital Workday for internal business operations.</p>
      <h2>No Public Marketplace Service</h2>
      <p>This is not a public SaaS connector. It is not intended to let unrelated third parties connect their own QuickBooks Online companies.</p>
      <h2>Authorization</h2>
      <p>Access depends on an active Intuit OAuth authorization. Removing authorization in either Digital Workday or QuickBooks Online disables future API access.</p>
      <h2>Availability</h2>
      <p>The integration is provided as-is for internal use and may be changed or disabled by the Digital Workday administrator.</p>
    `));
});

router.get("/launch", (_req, res) => {
  res.redirect("/settings/integrations");
});

router.get("/connect", (_req, res) => {
  res.redirect("/settings/integrations");
});

router.get("/disconnect", (_req, res) => {
  res
    .type("html")
    .send(htmlPage("QuickBooks Disconnected", `
      <h1>QuickBooks Disconnected</h1>
      <p>Your QuickBooks Online company has been disconnected from Digital Workday.</p>
      <p>To reconnect, sign in to Digital Workday and open Settings > Integrations.</p>
    `));
});

export default router;
