# Operations

**Status:** Current  
**Last Updated:** July 2026

This section covers system operations, monitoring, and maintenance.

---

## Documents in This Section

| Document | Description |
|----------|-------------|
| [SLOS_ALERTING_INCIDENT_RESPONSE.md](./SLOS_ALERTING_INCIDENT_RESPONSE.md) | SLOs, alert routing, and incident workflow |
| [REPOSITORY_GOVERNANCE.md](./REPOSITORY_GOVERNANCE.md) | Contribution, review, ownership, and release governance |
| [PUBLIC_CONTENT_GOVERNANCE.md](./PUBLIC_CONTENT_GOVERNANCE.md) | Public content, crawler, docs, and publishing boundaries |
| [Rollback Procedure](../ROLLBACK_PROCEDURE.md) | Production rollback and recovery workflow |
| [Incidents](../INCIDENTS.md) | Incident log and postmortem record |
| [Railway Verification Checklist](../RAILWAY_VERIFICATION_CHECKLIST.md) | Staging and production deployment verification |
| [Railway Deployment Checklist](../RAILWAY_DEPLOYMENT_CHECKLIST.md) | Railway variable and deploy checklist |
| [Top 1% Engineering Review](../review/top-one-percent-engineering-review-2026-07-21.md) | Integrated quality assessment and 30/90-day roadmap |

---

## System Health

### Health Check Endpoint

```
GET /health
GET /api/health
GET /readyz
```

### Super Admin System Status

Access via `/super-admin/status`:

- Database connectivity and latency
- S3/Mailgun integration status
- WebSocket connection status
- Tenant health metrics

---

## Monitoring

### Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| API Response Time | Average endpoint latency | > 500ms |
| Database Connections | Active pool connections | > 80% |
| Error Rate | 5xx errors / total | > 1% |
| Active Timers | Running time trackers | N/A |

### Logging

Application logs include:
- Request ID for correlation
- Tenant context
- User actions
- Error stack traces

### Release Gate

Run the aggregate release gate before production-bound deploys:

```bash
npm run release:check
```

---

## Backups

### Database Backups

Use Railway/Postgres provider backups and record restore drills in the incident or release notes.

### Manual Backup

```bash
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
```

---

## Maintenance Scripts

### Data Backfill

```bash
# Backfill missing tenant IDs
BACKFILL_TENANT_IDS_ALLOWED=true tsx server/scripts/backfillTenants.ts
```

### Data Purge

```bash
# Delete all application data (use with extreme caution)
PURGE_APP_DATA_ALLOWED=true PURGE_APP_DATA_CONFIRM=YES_PURGE_APP_DATA npm run dev
```

---

## Routine Maintenance

### Weekly

- [ ] Review error logs
- [ ] Check disk usage
- [ ] Verify backup completion

### Monthly

- [ ] Database vacuum
- [ ] Review slow queries
- [ ] Update dependencies

### Quarterly

- [ ] Security audit
- [ ] Performance review
- [ ] Disaster recovery test

---

## Related Sections

- [10-DEPLOYMENT](../10-DEPLOYMENT/) - Deployment setup
- [07-SECURITY](../07-SECURITY/) - Security operations
- [14-TROUBLESHOOTING](../14-TROUBLESHOOTING/) - Issue resolution
