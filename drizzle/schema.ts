import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, decimal, boolean, binary } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. Optional for local auth. */
  openId: varchar("openId", { length: 64 }).unique(),
  /** Username for local authentication */
  username: varchar("username", { length: 64 }).unique(),
  /** Bcrypt password hash for local authentication */
  passwordHash: varchar("passwordHash", { length: 255 }),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Modules table - Tracks all offensive security modules and their configurations
 */
export const modules = mysqlTable("modules", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  type: mysqlEnum("type", ["wifi", "hid", "rfid", "lan", "logging"]).notNull(),
  status: mysqlEnum("status", ["idle", "running", "paused", "error"]).default("idle").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  configuration: json("configuration"),
  lastExecuted: timestamp("lastExecuted"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Module = typeof modules.$inferSelect;
export type InsertModule = typeof modules.$inferInsert;

/**
 * Hardware status table - Real-time hardware health monitoring
 */
export const hardwareStatus = mysqlTable("hardware_status", {
  id: int("id").autoincrement().primaryKey(),
  deviceType: mysqlEnum("deviceType", ["esp32_s3", "raspberry_pi", "rfid_module"]).notNull(),
  status: mysqlEnum("status", ["online", "offline", "error"]).default("offline").notNull(),
  cpuUsage: decimal("cpuUsage", { precision: 5, scale: 2 }),
  memoryUsage: decimal("memoryUsage", { precision: 5, scale: 2 }),
  temperature: decimal("temperature", { precision: 5, scale: 2 }),
  lastHeartbeat: timestamp("lastHeartbeat"),
  metadata: json("metadata"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type HardwareStatus = typeof hardwareStatus.$inferSelect;
export type InsertHardwareStatus = typeof hardwareStatus.$inferInsert;

/**
 * Activity logs table - Centralized logging for all module operations
 */
export const activityLogs = mysqlTable("activity_logs", {
  id: int("id").autoincrement().primaryKey(),
  moduleId: int("moduleId").notNull(),
  userId: int("userId"),
  action: varchar("action", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["initiated", "in_progress", "completed", "failed"]).notNull(),
  details: json("details"),
  output: text("output"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  duration: int("duration"),
});

export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = typeof activityLogs.$inferInsert;

/**
 * WiFi networks table - Discovered WiFi networks for attack module
 */
export const wifiNetworks = mysqlTable("wifi_networks", {
  id: int("id").autoincrement().primaryKey(),
  ssid: varchar("ssid", { length: 255 }).notNull(),
  bssid: varchar("bssid", { length: 17 }).notNull().unique(),
  channel: int("channel"),
  signalStrength: int("signalStrength"),
  encryption: varchar("encryption", { length: 64 }),
  lastDiscovered: timestamp("lastDiscovered").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WiFiNetwork = typeof wifiNetworks.$inferSelect;
export type InsertWiFiNetwork = typeof wifiNetworks.$inferInsert;

/**
 * HID payloads table - Stored HID injection payloads
 */
export const hidPayloads = mysqlTable("hid_payloads", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  payload: text("payload").notNull(),
  keystrokes: json("keystrokes"),
  delayMs: int("delayMs").default(100).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type HIDPayload = typeof hidPayloads.$inferSelect;
export type InsertHIDPayload = typeof hidPayloads.$inferInsert;

/**
 * RFID tags table - Discovered and cloned RFID tags
 */
export const rfidTags = mysqlTable("rfid_tags", {
  id: int("id").autoincrement().primaryKey(),
  tagId: varchar("tagId", { length: 64 }).notNull().unique(),
  tagType: varchar("tagType", { length: 64 }),
  data: binary("data"),
  isCloned: boolean("isCloned").default(false).notNull(),
  clonedFrom: int("clonedFrom"),
  discoveredAt: timestamp("discoveredAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RFIDTag = typeof rfidTags.$inferSelect;
export type InsertRFIDTag = typeof rfidTags.$inferInsert;

/**
 * LAN devices table - Discovered LAN devices for implantation module
 */
export const lanDevices = mysqlTable("lan_devices", {
  id: int("id").autoincrement().primaryKey(),
  ipAddress: varchar("ipAddress", { length: 45 }).notNull().unique(),
  macAddress: varchar("macAddress", { length: 17 }),
  hostname: varchar("hostname", { length: 255 }),
  osType: varchar("osType", { length: 64 }),
  openPorts: json("openPorts"),
  services: json("services"),
  discoveredAt: timestamp("discoveredAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LANDevice = typeof lanDevices.$inferSelect;
export type InsertLANDevice = typeof lanDevices.$inferInsert;

/**
 * System settings table - Global system configuration
 */
export const systemSettings = mysqlTable("system_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 128 }).notNull().unique(),
  value: json("value"),
  description: text("description"),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;
