#!/usr/bin/env bash
#
# tenancy-scan.sh — Static analysis for unscoped tenant queries
#
# Scans server code for patterns that bypass tenant scoping.
# Exit code 0 = clean, 1 = violations found.
#
# Usage:
#   bash scripts/tenancy-scan.sh          # full scan
#   bash scripts/tenancy-scan.sh --quiet  # exit code only
#
# Allowlist:
#   Files in ALLOWLIST are expected to have unscoped access (super-admin, system jobs).

set -euo pipefail

QUIET=false
[[ "${1:-}" == "--quiet" ]] && QUIET=true

SCAN_DIRS="server/http server/routes server/features"

# Files allowed to use unscoped methods (super-admin, system, migration)
ALLOWLIST=(
  "server/http/domains/superAdmin.router.ts"
  "server/http/domains/admin.router.ts"
  "server/routes/superAdmin.routes.ts"
  "server/routes/admin.routes.ts"
  "server/storage.ts"
  "server/storage/tenantScoped.ts"
  "server/lib/tenancyGuards.ts"
  "server/middleware/"
  "server/tests/"
  "server/features/notifications/"
)

# Patterns that indicate unscoped access to tenant-owned data
UNSCOPED_PATTERNS=(
  'storage\.getProject\b'
  'storage\.getTask\b'
  'storage\.getClient\b'
  'storage\.getTimeEntry\b'
  'storage\.getActiveTimer\b'
  'storage\.getComment\b'
  'storage\.getSection\b'
  'storage\.createProject\b'
  'storage\.createTask\b'
  'storage\.createClient\b'
  'storage\.createTimeEntry\b'
  'storage\.updateProject\b'
  'storage\.updateTask\b'
  'storage\.updateClient\b'
  'storage\.updateTimeEntry\b'
  'storage\.deleteTask\b'
  'storage\.deleteClient\b'
  'storage\.deleteTimeEntry\b'
)

build_allowlist_glob() {
  local globs=""
  for path in "${ALLOWLIST[@]}"; do
    globs+=" --glob '!${path}*'"
  done
  echo "$globs"
}

VIOLATIONS=0
VIOLATION_DETAILS=""

for pattern in "${UNSCOPED_PATTERNS[@]}"; do
  while IFS= read -r match; do
    if [[ -z "$match" ]]; then continue; fi

    # Check against allowlist
    allowed=false
    for allow_path in "${ALLOWLIST[@]}"; do
      if [[ "$match" == *"$allow_path"* ]]; then
        allowed=true
        break
      fi
    done

    if [[ "$allowed" == false ]]; then
      VIOLATIONS=$((VIOLATIONS + 1))
      VIOLATION_DETAILS+="  $match\n"
    fi
  done < <(grep -rn --include="*.ts" "$pattern" $SCAN_DIRS 2>/dev/null || true)
done

if [[ $VIOLATIONS -gt 0 ]]; then
  if [[ "$QUIET" == false ]]; then
    echo "=== TENANCY SCAN: $VIOLATIONS violation(s) found ==="
    echo ""
    echo "The following code uses unscoped storage methods on tenant-owned data."
    echo "Use TenantScopedStorage (server/storage/tenantScoped.ts) or tenant-scoped"
    echo "variants (e.g., storage.getProjectByIdAndTenant) instead."
    echo ""
    echo -e "$VIOLATION_DETAILS"
    echo ""
    echo "If this is intentional (super-admin, system job), add the file to the"
    echo "ALLOWLIST in this script."
  fi
  exit 1
else
  if [[ "$QUIET" == false ]]; then
    echo "=== TENANCY SCAN: Clean — no unscoped tenant queries found ==="
  fi
  exit 0
fi
