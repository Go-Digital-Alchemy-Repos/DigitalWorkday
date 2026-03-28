import { Router } from 'express';
import { requireSuperUser } from '../../../middleware/tenantContext';
import { db } from '../../../db';
import { users } from '@shared/schema';
import { eq, and, isNotNull } from 'drizzle-orm';

export const employeeLocationsRouter = Router();

employeeLocationsRouter.get(
  '/tenants/:tenantId/employee-locations',
  requireSuperUser,
  async (req, res) => {
    try {
      const { tenantId } = req.params;

      const clientRoles = ['client', 'client_viewer', 'client_collaborator'];

      const allUsers = await db.select({
        id: users.id,
        name: users.name,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
        avatarUrl: users.avatarUrl,
        isActive: users.isActive,
        locationLat: users.locationLat,
        locationLng: users.locationLng,
        locationUpdatedAt: users.locationUpdatedAt,
      })
      .from(users)
      .where(eq(users.tenantId, tenantId));

      const employees = allUsers.filter(u => u.isActive && !clientRoles.includes(u.role));

      const withLocation = employees
        .filter(u => u.locationLat != null && u.locationLng != null)
        .map(u => ({
          id: u.id,
          name: u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.name,
          email: u.email,
          role: u.role,
          avatarUrl: u.avatarUrl,
          isActive: u.isActive,
          lat: parseFloat(u.locationLat!),
          lng: parseFloat(u.locationLng!),
          locationUpdatedAt: u.locationUpdatedAt,
        }));

      const withoutLocation = employees
        .filter(u => u.locationLat == null || u.locationLng == null)
        .map(u => ({
          id: u.id,
          name: u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.name,
          email: u.email,
          role: u.role,
          avatarUrl: u.avatarUrl,
        }));

      res.json({
        withLocation,
        withoutLocation,
        totalWithLocation: withLocation.length,
        totalWithoutLocation: withoutLocation.length,
      });
    } catch (error) {
      console.error('Employee locations error:', error);
      res.status(500).json({ error: 'Failed to fetch employee locations' });
    }
  }
);
