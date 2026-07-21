import { Router } from 'express';

// Compatibility mount retained for the super-admin route aggregator.
// Tenant selection endpoints are owned by the active tenant routers.
export const tenantPickerRouter = Router();
