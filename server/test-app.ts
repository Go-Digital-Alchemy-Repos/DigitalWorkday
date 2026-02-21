import "dotenv/config";
import type express from "express";
import { createAppWithRoutes } from "./appFactory";

let testAppInstance: express.Express | null = null;

export async function createTestApp(): Promise<express.Express> {
  if (testAppInstance) {
    return testAppInstance;
  }

  const { app } = await createAppWithRoutes({ testMode: false });
  testAppInstance = app;
  return app;
}
