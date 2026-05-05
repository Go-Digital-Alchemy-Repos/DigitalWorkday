import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { db } from '../../../db';

export const employeeLocationsRouter = Router();

type EmployeeLocationRow = {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: string;
  avatar_url: string | null;
  is_active: boolean;
  location_lat: string | null;
  location_lng: string | null;
  location_updated_at: string | null;
};

async function queryRows<T>(q: ReturnType<typeof sql>): Promise<T[]> {
  const result = await db.execute(q);
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && 'rows' in result) {
    return (result as { rows: T[] }).rows;
  }
  return result as unknown as T[];
}

async function userLocationColumnsExist(): Promise<boolean> {
  const rows = await queryRows<{ column_name: string }>(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name IN ('location_lat', 'location_lng', 'location_updated_at')
  `);
  const columns = new Set(rows.map((r) => r.column_name));
  return columns.has('location_lat') && columns.has('location_lng') && columns.has('location_updated_at');
}

employeeLocationsRouter.get(
  '/tenants/:tenantId/employee-locations',
  requireSuperUser,
  async (req, res) => {
    try {
      const { tenantId } = req.params;
      const hasLocationColumns = await userLocationColumnsExist();

      const rows = await queryRows<EmployeeLocationRow>(hasLocationColumns
        ? sql`
            SELECT
              id,
              name,
              first_name,
              last_name,
              email,
              role,
              avatar_url,
              is_active,
              location_lat::text,
              location_lng::text,
              location_updated_at::text
            FROM users
            WHERE tenant_id = ${tenantId}
          `
        : sql`
            SELECT
              id,
              name,
              first_name,
              last_name,
              email,
              role,
              avatar_url,
              is_active,
              NULL::text AS location_lat,
              NULL::text AS location_lng,
              NULL::text AS location_updated_at
            FROM users
            WHERE tenant_id = ${tenantId}
          `
      );

      const clientRoles = ['client', 'client_viewer', 'client_collaborator'];
      const employees = rows.filter((u) => u.is_active && !clientRoles.includes(u.role));
      const formatName = (u: EmployeeLocationRow) =>
        u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.name;

      const withLocation = employees
        .filter((u) => u.location_lat != null && u.location_lng != null)
        .map((u) => ({
          id: u.id,
          name: formatName(u),
          email: u.email,
          role: u.role,
          avatarUrl: u.avatar_url,
          isActive: u.is_active,
          lat: Number(u.location_lat),
          lng: Number(u.location_lng),
          locationUpdatedAt: u.location_updated_at,
        }));

      const withoutLocation = employees
        .filter((u) => u.location_lat == null || u.location_lng == null)
        .map((u) => ({
          id: u.id,
          name: formatName(u),
          email: u.email,
          role: u.role,
          avatarUrl: u.avatar_url,
        }));

      res.json({
        withLocation,
        withoutLocation,
        totalWithLocation: withLocation.length,
        totalWithoutLocation: withoutLocation.length,
        locationColumnsAvailable: hasLocationColumns,
      });
    } catch (error) {
      console.error('Employee locations error:', error);
      res.status(500).json({ error: 'Failed to fetch employee locations' });
    }
  }
);
