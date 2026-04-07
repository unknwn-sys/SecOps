import { eq, desc, and, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, users,
  Module, InsertModule, modules,
  HardwareStatus, InsertHardwareStatus, hardwareStatus,
  ActivityLog, InsertActivityLog, activityLogs,
  WiFiNetwork, InsertWiFiNetwork, wifiNetworks,
  HIDPayload, InsertHIDPayload, hidPayloads,
  RFIDTag, InsertRFIDTag, rfidTags,
  LANDevice, InsertLANDevice, lanDevices,
  SystemSetting, InsertSystemSetting, systemSettings,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============ USER QUERIES ============

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserLastSignedIn(id: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update user: database not available");
    return;
  }

  try {
    await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
  } catch (error) {
    console.error("[Database] Failed to update last signed in:", error);
  }
}

// ============ MODULE QUERIES ============

export async function getAllModules() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(modules);
}

export async function getModuleById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(modules).where(eq(modules.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getModuleByName(name: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(modules).where(eq(modules.name, name)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createModule(data: InsertModule) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(modules).values(data);
  return result;
}

export async function updateModuleStatus(id: number, status: Module['status']) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(modules).set({ status, updatedAt: new Date() }).where(eq(modules.id, id));
}

// ============ HARDWARE STATUS QUERIES ============

export async function getHardwareStatus(deviceType?: HardwareStatus['deviceType']) {
  const db = await getDb();
  if (!db) return [];
  if (deviceType) {
    return db.select().from(hardwareStatus).where(eq(hardwareStatus.deviceType, deviceType));
  }
  return db.select().from(hardwareStatus);
}

export async function updateHardwareStatus(deviceType: HardwareStatus['deviceType'], data: Partial<InsertHardwareStatus>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await db.select().from(hardwareStatus).where(eq(hardwareStatus.deviceType, deviceType)).limit(1);
  
  if (existing.length > 0) {
    return db.update(hardwareStatus).set({ ...data, updatedAt: new Date() }).where(eq(hardwareStatus.deviceType, deviceType));
  } else {
    return db.insert(hardwareStatus).values({ deviceType, ...data });
  }
}

// ============ ACTIVITY LOG QUERIES ============

export async function createActivityLog(data: InsertActivityLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(activityLogs).values(data);
}

export async function getActivityLogs(filters?: {
  moduleId?: number;
  userId?: number;
  status?: ActivityLog['status'];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];

  if (filters?.moduleId) conditions.push(eq(activityLogs.moduleId, filters.moduleId));
  if (filters?.userId) conditions.push(eq(activityLogs.userId, filters.userId));
  if (filters?.status) conditions.push(eq(activityLogs.status, filters.status));
  if (filters?.startDate) conditions.push(gte(activityLogs.startedAt, filters.startDate));
  if (filters?.endDate) conditions.push(lte(activityLogs.startedAt, filters.endDate));

  let query: any = db.select().from(activityLogs);

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  query = query.orderBy(desc(activityLogs.startedAt));

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }
  if (filters?.offset) {
    query = query.offset(filters.offset);
  }

  return query;
}

export async function updateActivityLog(id: number, data: Partial<ActivityLog>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(activityLogs).set(data).where(eq(activityLogs.id, id));
}

// ============ WIFI NETWORK QUERIES ============

export async function getAllWiFiNetworks() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(wifiNetworks).orderBy(desc(wifiNetworks.lastDiscovered));
}

export async function upsertWiFiNetwork(data: InsertWiFiNetwork) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(wifiNetworks).values(data).onDuplicateKeyUpdate({
    set: { lastDiscovered: new Date(), updatedAt: new Date() },
  });
}

// ============ HID PAYLOAD QUERIES ============

export async function createHIDPayload(data: InsertHIDPayload) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(hidPayloads).values(data);
}

export async function getHIDPayloads(createdBy?: number) {
  const db = await getDb();
  if (!db) return [];
  if (createdBy) {
    return db.select().from(hidPayloads).where(eq(hidPayloads.createdBy, createdBy)).orderBy(desc(hidPayloads.createdAt));
  }
  return db.select().from(hidPayloads).orderBy(desc(hidPayloads.createdAt));
}

export async function getHIDPayloadById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(hidPayloads).where(eq(hidPayloads.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function deleteHIDPayload(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(hidPayloads).where(eq(hidPayloads.id, id));
}

// ============ RFID TAG QUERIES ============

export async function getAllRFIDTags() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(rfidTags).orderBy(desc(rfidTags.discoveredAt));
}

export async function getRFIDTagById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(rfidTags).where(eq(rfidTags.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertRFIDTag(data: InsertRFIDTag) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(rfidTags).values(data).onDuplicateKeyUpdate({
    set: { updatedAt: new Date() },
  });
}

export async function updateRFIDTag(id: number, data: Partial<RFIDTag>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(rfidTags).set(data).where(eq(rfidTags.id, id));
}

// ============ LAN DEVICE QUERIES ============

export async function getAllLANDevices() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(lanDevices).orderBy(desc(lanDevices.discoveredAt));
}

export async function getLANDeviceByIP(ipAddress: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(lanDevices).where(eq(lanDevices.ipAddress, ipAddress)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertLANDevice(data: InsertLANDevice) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(lanDevices).values(data).onDuplicateKeyUpdate({
    set: { updatedAt: new Date() },
  });
}

export async function updateLANDevice(id: number, data: Partial<LANDevice>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(lanDevices).set(data).where(eq(lanDevices.id, id));
}

// ============ SYSTEM SETTINGS QUERIES ============

export async function getSystemSetting(key: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllSystemSettings() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(systemSettings);
}

export async function upsertSystemSetting(key: string, value: unknown, description?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(systemSettings).values({ key, value, description }).onDuplicateKeyUpdate({
    set: { value, description, updatedAt: new Date() },
  });
}
