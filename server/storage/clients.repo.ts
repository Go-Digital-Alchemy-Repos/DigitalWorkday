import {
  type Client, type InsertClient,
  type ClientContact, type InsertClientContact,
  type ClientInvite, type InsertClientInvite,
  type ClientUserAccess, type InsertClientUserAccess,
  type User,
  type Project,
  type ClientWithContacts,
  clients, clientContacts, clientInvites, clientUserAccess,
  projects, users,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, asc, inArray, isNull } from "drizzle-orm";
import { assertInsertHasTenantId } from "../lib/errors";

export class ClientsRepository {
  private getUser: (id: string) => Promise<User | undefined>;
  private getProjectsByClient: (clientId: string) => Promise<Project[]>;

  constructor(deps: {
    getUser: (id: string) => Promise<User | undefined>;
    getProjectsByClient: (clientId: string) => Promise<Project[]>;
  }) {
    this.getUser = deps.getUser;
    this.getProjectsByClient = deps.getProjectsByClient;
  }

  async getClient(id: string): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    return client || undefined;
  }

  async getClientsByIds(ids: string[]): Promise<Client[]> {
    if (ids.length === 0) return [];
    return db.select().from(clients).where(inArray(clients.id, ids));
  }

  async getClientWithContacts(id: string): Promise<ClientWithContacts | undefined> {
    const client = await this.getClient(id);
    if (!client) return undefined;
    
    const contacts = await this.getContactsByClient(id);
    const clientProjects = await this.getProjectsByClient(id);
    
    return { ...client, contacts, projects: clientProjects };
  }

  async getClientsByWorkspace(workspaceId: string): Promise<ClientWithContacts[]> {
    const clientsList = await db.select()
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId))
      .orderBy(asc(clients.companyName));
    
    const result: ClientWithContacts[] = [];
    for (const client of clientsList) {
      const contacts = await this.getContactsByClient(client.id);
      const clientProjects = await this.getProjectsByClient(client.id);
      result.push({ ...client, contacts, projects: clientProjects });
    }
    return result;
  }

  async createClient(insertClient: InsertClient): Promise<Client> {
    assertInsertHasTenantId(insertClient, "clients");
    const [client] = await db.insert(clients).values(insertClient).returning();
    return client;
  }

  async updateClient(id: string, client: Partial<InsertClient>): Promise<Client | undefined> {
    const [updated] = await db.update(clients)
      .set({ ...client, updatedAt: new Date() })
      .where(eq(clients.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteClient(id: string): Promise<void> {
    await db.delete(clientInvites).where(eq(clientInvites.clientId, id));
    await db.delete(clientContacts).where(eq(clientContacts.clientId, id));
    await db.update(projects).set({ clientId: null }).where(eq(projects.clientId, id));
    await db.delete(clients).where(eq(clients.id, id));
  }

  async getClientContact(id: string): Promise<ClientContact | undefined> {
    const [contact] = await db.select().from(clientContacts).where(eq(clientContacts.id, id));
    return contact || undefined;
  }

  async getContactsByClient(clientId: string): Promise<ClientContact[]> {
    return db.select()
      .from(clientContacts)
      .where(eq(clientContacts.clientId, clientId))
      .orderBy(desc(clientContacts.isPrimary), asc(clientContacts.firstName));
  }

  async createClientContact(insertContact: InsertClientContact): Promise<ClientContact> {
    const [contact] = await db.insert(clientContacts).values(insertContact).returning();
    return contact;
  }

  async updateClientContact(id: string, contact: Partial<InsertClientContact>): Promise<ClientContact | undefined> {
    const [updated] = await db.update(clientContacts)
      .set({ ...contact, updatedAt: new Date() })
      .where(eq(clientContacts.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteClientContact(id: string): Promise<void> {
    await db.delete(clientInvites).where(eq(clientInvites.contactId, id));
    await db.delete(clientContacts).where(eq(clientContacts.id, id));
  }

  async getClientInvite(id: string): Promise<ClientInvite | undefined> {
    const [invite] = await db.select().from(clientInvites).where(eq(clientInvites.id, id));
    return invite || undefined;
  }

  async getInvitesByClient(clientId: string): Promise<ClientInvite[]> {
    return db.select()
      .from(clientInvites)
      .where(eq(clientInvites.clientId, clientId))
      .orderBy(desc(clientInvites.createdAt));
  }

  async createClientInvite(insertInvite: InsertClientInvite): Promise<ClientInvite> {
    const [invite] = await db.insert(clientInvites).values(insertInvite).returning();
    return invite;
  }

  async updateClientInvite(id: string, invite: Partial<InsertClientInvite>): Promise<ClientInvite | undefined> {
    const [updated] = await db.update(clientInvites)
      .set({ ...invite, updatedAt: new Date() })
      .where(eq(clientInvites.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteClientInvite(id: string): Promise<void> {
    await db.delete(clientInvites).where(eq(clientInvites.id, id));
  }

  async addClientUserAccess(access: InsertClientUserAccess): Promise<ClientUserAccess> {
    const [result] = await db.insert(clientUserAccess).values(access).returning();
    return result;
  }

  async getClientUsers(clientId: string): Promise<Array<{ user: User; access: ClientUserAccess }>> {
    const accessRecords = await db.select()
      .from(clientUserAccess)
      .where(eq(clientUserAccess.clientId, clientId));
    
    const result: Array<{ user: User; access: ClientUserAccess }> = [];
    for (const access of accessRecords) {
      const [user] = await db.select().from(users).where(eq(users.id, access.userId));
      if (user) {
        result.push({ user, access });
      }
    }
    return result;
  }

  async getClientUserAccessByUserAndClient(userId: string, clientId: string): Promise<ClientUserAccess | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
    
    if (!user || !client) return undefined;
    if (user.tenantId !== client.tenantId) return undefined;
    
    const [access] = await db.select()
      .from(clientUserAccess)
      .where(and(
        eq(clientUserAccess.userId, userId),
        eq(clientUserAccess.clientId, clientId)
      ));
    return access || undefined;
  }

  async updateClientUserAccess(clientId: string, userId: string, updates: Partial<InsertClientUserAccess>): Promise<ClientUserAccess | undefined> {
    const [updated] = await db.update(clientUserAccess)
      .set(updates)
      .where(and(
        eq(clientUserAccess.clientId, clientId),
        eq(clientUserAccess.userId, userId)
      ))
      .returning();
    return updated || undefined;
  }

  async deleteClientUserAccess(clientId: string, userId: string): Promise<void> {
    await db.delete(clientUserAccess)
      .where(and(
        eq(clientUserAccess.clientId, clientId),
        eq(clientUserAccess.userId, userId)
      ));
  }

  async getClientsForUser(userId: string): Promise<Array<{ client: Client; access: ClientUserAccess }>> {
    const accessRecords = await db.select()
      .from(clientUserAccess)
      .where(eq(clientUserAccess.userId, userId));
    
    const result: Array<{ client: Client; access: ClientUserAccess }> = [];
    for (const access of accessRecords) {
      const client = await this.getClient(access.clientId);
      if (client) {
        result.push({ client, access });
      }
    }
    return result;
  }

  async getClientByIdAndTenant(id: string, tenantId: string): Promise<Client | undefined> {
    const [client] = await db.select().from(clients)
      .where(and(eq(clients.id, id), eq(clients.tenantId, tenantId)));
    return client || undefined;
  }

  async getClientsByTenant(tenantId: string, _workspaceId?: string): Promise<ClientWithContacts[]> {
    const clientsList = await db.select()
      .from(clients)
      .where(eq(clients.tenantId, tenantId))
      .orderBy(asc(clients.companyName));
    
    const result: ClientWithContacts[] = [];
    for (const client of clientsList) {
      const contacts = await this.getContactsByClient(client.id);
      const clientProjects = await this.getProjectsByClient(client.id);
      result.push({ ...client, contacts, projects: clientProjects });
    }
    return result;
  }

  async createClientWithTenant(insertClient: InsertClient, tenantId: string): Promise<Client> {
    const [client] = await db.insert(clients).values({ ...insertClient, tenantId }).returning();
    return client;
  }

  async updateClientWithTenant(id: string, tenantId: string, client: Partial<InsertClient>): Promise<Client | undefined> {
    const [updated] = await db.update(clients)
      .set({ ...client, updatedAt: new Date() })
      .where(and(eq(clients.id, id), eq(clients.tenantId, tenantId)))
      .returning();
    return updated || undefined;
  }

  async deleteClientWithTenant(id: string, tenantId: string): Promise<boolean> {
    const [existing] = await db.select().from(clients)
      .where(and(eq(clients.id, id), eq(clients.tenantId, tenantId)));
    if (!existing) return false;
    
    await db.delete(clientInvites).where(eq(clientInvites.clientId, id));
    await db.delete(clientContacts).where(eq(clientContacts.clientId, id));
    await db.update(projects).set({ clientId: null }).where(eq(projects.clientId, id));
    await db.delete(clients).where(eq(clients.id, id));
    return true;
  }

  // Parent-Child Client Hierarchy Methods
  
  async getChildClients(parentClientId: string): Promise<Client[]> {
    return db.select()
      .from(clients)
      .where(eq(clients.parentClientId, parentClientId))
      .orderBy(asc(clients.companyName));
  }

  async getTopLevelClients(tenantId: string): Promise<Client[]> {
    return db.select()
      .from(clients)
      .where(and(
        eq(clients.tenantId, tenantId),
        isNull(clients.parentClientId)
      ))
      .orderBy(asc(clients.companyName));
  }

  async getClientsByTenantWithHierarchy(tenantId: string): Promise<(Client & { depth: number; parentName?: string })[]> {
    // Get all clients for the tenant
    const allClients = await db.select()
      .from(clients)
      .where(eq(clients.tenantId, tenantId))
      .orderBy(asc(clients.companyName));
    
    // Build a map of clients by ID
    const clientMap = new Map<string, Client>();
    for (const client of allClients) {
      clientMap.set(client.id, client);
    }
    
    // Build hierarchy with depth calculation
    const result: (Client & { depth: number; parentName?: string })[] = [];
    
    // First, add all top-level clients
    const topLevel = allClients.filter(c => !c.parentClientId);
    
    // Recursive function to add client and its children
    const addWithChildren = (client: Client, depth: number, parentName?: string) => {
      result.push({ 
        ...client, 
        depth, 
        parentName 
      });
      
      // Find and add children
      const children = allClients.filter(c => c.parentClientId === client.id);
      for (const child of children) {
        addWithChildren(child, depth + 1, client.companyName);
      }
    };
    
    // Process top-level clients first, then their children recursively
    for (const client of topLevel) {
      addWithChildren(client, 0);
    }
    
    return result;
  }

  async validateParentClient(parentClientId: string, tenantId: string): Promise<boolean> {
    if (!parentClientId) return true; // null parent is always valid
    
    const [parent] = await db.select()
      .from(clients)
      .where(and(
        eq(clients.id, parentClientId),
        eq(clients.tenantId, tenantId)
      ));
    return !!parent;
  }

  async getParentClient(clientId: string): Promise<Client | undefined> {
    const client = await this.getClient(clientId);
    if (!client || !client.parentClientId) return undefined;
    return this.getClient(client.parentClientId);
  }
}
