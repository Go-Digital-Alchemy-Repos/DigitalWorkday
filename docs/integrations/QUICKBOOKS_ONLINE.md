# QuickBooks Online Integration

Digital Workday supports a private QuickBooks Online Accounting API connection for the owner/admin's QuickBooks company. It is intentionally tenant-admin scoped and is not a public SaaS connector for unrelated third-party QuickBooks companies.

## Digital Workday URLs for Intuit

Set `APP_PUBLIC_URL` in production before connecting QuickBooks. The redirect URI must exactly match the value registered in Intuit.

For the current Railway deployment, use:

| Intuit field | Value |
| --- | --- |
| Redirect URI | `https://digitalworkday.ai/api/v1/tenant/integrations/quickbooks/callback` |
| Host domain | `digitalworkday.ai` |
| Launch URL | `https://digitalworkday.ai/quickbooks/launch` |
| Connect/Reconnect URL | `https://digitalworkday.ai/quickbooks/connect` |
| Disconnect URL | `https://digitalworkday.ai/quickbooks/disconnect` |
| Privacy Policy URL | `https://digitalworkday.ai/quickbooks/privacy` |
| End User License Agreement URL | `https://digitalworkday.ai/quickbooks/eula` |

## App Settings

In Intuit Developer:

1. Create or open the private QuickBooks Online app.
2. Enable the Accounting API scope.
3. Add the redirect URI for Development or Production, matching the Digital Workday environment.
4. Add the app URLs and terms URLs above.
5. Use Development credentials for sandbox companies and Production credentials for the live QuickBooks company.

## Digital Workday Setup

1. Open `Settings > Integrations`.
2. Find `QuickBooks Online`.
3. Select `Sandbox / Development` or `Production`.
4. Enter the Intuit Client ID and Client Secret.
5. Save.
6. Click `Connect QuickBooks` and approve access in Intuit.
7. Return to the QuickBooks card and run `Test Connection`.

Secrets and OAuth tokens are stored in `tenant_integrations.config_encrypted` using `APP_ENCRYPTION_KEY`.
