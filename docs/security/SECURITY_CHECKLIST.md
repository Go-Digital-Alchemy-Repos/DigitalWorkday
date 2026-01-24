# Security Checklist

**Status:** Current  
**Last Updated:** January 2026  
**Purpose:** Security verification for code reviews and audits

---

## Tenant Isolation Checklist

### Database Queries

- [ ] **All SELECT queries filter by tenant_id**
  ```typescript
  .where(eq(table.tenantId, effectiveTenantId))
  ```

- [ ] **All INSERT statements include tenant_id**
  ```typescript
  tenantId: effectiveTenantId,
  ```

- [ ] **All UPDATE statements verify tenant ownership first**
  ```typescript
  const entity = await getById(id);
  if (entity.tenantId !== effectiveTenantId) throw new ForbiddenError();
  ```

- [ ] **No workspace-based visibility filters**
  ```typescript
  // NEVER use workspaceId for data visibility
  ```

### API Endpoints

- [ ] **effectiveTenantId comes from auth context, not request body**
- [ ] **Cross-tenant access returns 403 Forbidden**
- [ ] **Entity existence checks don't leak info across tenants**

---

## Authentication Checklist

- [ ] **Session-based auth enforced on protected routes**
- [ ] **Role checks for admin-only operations**
- [ ] **Rate limiting on login/registration endpoints**
- [ ] **Password hashing uses bcrypt with adequate rounds**

---

## Storage Security Checklist

- [ ] **Storage resolver used (not direct S3 client)**
- [ ] **Credentials never exposed to client**
- [ ] **Signed URLs for private files**
- [ ] **File paths include tenant_id for isolation**
- [ ] **Content-type validation on uploads**
- [ ] **File size limits enforced**

---

## Chat Security Checklist

- [ ] **Socket.IO rooms namespaced by tenant**
- [ ] **Membership validated before room join**
- [ ] **Membership validated before message send**
- [ ] **No cross-tenant message visibility**
- [ ] **Attachments use storage resolver**

---

## Super Admin Operations Checklist

- [ ] **Audit logging for all provisioning actions**
- [ ] **Primary workspace helper used**
- [ ] **Request IDs logged for debugging**
- [ ] **Impersonation properly scoped**

---

## Secrets Management Checklist

- [ ] **No secrets in logs**
- [ ] **No secrets in error responses**
- [ ] **No secrets in client-side code**
- [ ] **Encryption key required for sensitive data**
- [ ] **Secrets rotatable without code changes**

---

## Input Validation Checklist

- [ ] **Request body validated with Zod schemas**
- [ ] **SQL injection prevented (parameterized queries)**
- [ ] **XSS prevented (output encoding)**
- [ ] **Path traversal prevented (filename sanitization)**

---

## Quick Security Tests

### Test 1: Cross-Tenant Access
```bash
# As Tenant A user, try to access Tenant B resource
curl -X GET /api/projects/:tenantBProjectId -H "Cookie: tenant_a_session"
# Expected: 403 or 404
```

### Test 2: Missing Tenant Filter
```bash
# Search for queries without tenant filter
grep -r "db.select()" --include="*.ts" | grep -v "tenantId"
```

### Test 3: Credential Exposure
```bash
# Search for potential credential exposure
grep -r "secretAccessKey\|AWS_SECRET" --include="*.ts" | grep -v ".env"
```

---

## Common Vulnerabilities to Avoid

| Vulnerability | Prevention |
|---------------|------------|
| IDOR (Insecure Direct Object Reference) | Always verify tenant ownership |
| Cross-tenant data leak | Always filter by effectiveTenantId |
| Credential exposure | Use storage resolver, signed URLs |
| SQL Injection | Use Drizzle ORM (parameterized) |
| Session hijacking | HttpOnly, Secure cookies |
| Brute force | Rate limiting |

---

## Related Documentation

- [Tenancy Model](../architecture/TENANCY_MODEL.md)
- [Storage Overview](../storage/STORAGE_OVERVIEW.md)
- [Chat Architecture](../chat/CHAT_ARCHITECTURE.md)
