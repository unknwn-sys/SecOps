import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const PAYLOADS_DIR = path.join(process.cwd(), "data/payloads");
const ENCRYPTION_KEY = process.env.JWT_SECRET?.slice(0, 32) || "default-key-change-in-production!!";

// Ensure payloads directory exists
export function initializeStorage() {
  if (!fs.existsSync(PAYLOADS_DIR)) {
    fs.mkdirSync(PAYLOADS_DIR, { recursive: true });
  }
}

// Encryption utilities
export function encryptPayload(data: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);

  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");

  return iv.toString("hex") + ":" + encrypted;
}

export function decryptPayload(encryptedData: string): string {
  try {
    const [ivHex, encrypted] = encryptedData.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch {
    throw new Error("Failed to decrypt payload - key mismatch or corrupted data");
  }
}

// Payload storage functions
export interface StoredPayload {
  id: string;
  name: string;
  type: "hid" | "rfid" | "wifi" | "lan" | "generic";
  description: string;
  content: Record<string, any>;
  encrypted: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

export function savePayload(payload: StoredPayload, encrypt: boolean = false): void {
  initializeStorage();

  const typePath = path.join(PAYLOADS_DIR, payload.type);
  if (!fs.existsSync(typePath)) {
    fs.mkdirSync(typePath, { recursive: true });
  }

  const filePath = path.join(typePath, `${payload.id}.json`);
  const payloadData = { ...payload, encrypted: encrypt };

  const content = JSON.stringify(payloadData, null, 2);
  const finalContent = encrypt ? encryptPayload(content) : content;

  fs.writeFileSync(filePath, finalContent, "utf8");
}

export function loadPayload(id: string, type: string): StoredPayload | null {
  const filePath = path.join(PAYLOADS_DIR, type, `${id}.json`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, "utf8");

  try {
    const data = JSON.parse(content);
    if (data.encrypted) {
      const decrypted = decryptPayload(content);
      return JSON.parse(decrypted);
    }
    return data;
  } catch {
    return null;
  }
}

export function getAllPayloads(type?: string): StoredPayload[] {
  initializeStorage();

  const payloads: StoredPayload[] = [];
  const searchPath = type ? path.join(PAYLOADS_DIR, type) : PAYLOADS_DIR;

  if (!fs.existsSync(searchPath)) {
    return payloads;
  }

  const items = fs.readdirSync(searchPath);

  items.forEach((item) => {
    const fullPath = path.join(searchPath, item);
    const stats = fs.statSync(fullPath);

    if (stats.isDirectory()) {
      // Recurse into subdirectory
      const subPayloads = getAllPayloads(item);
      payloads.push(...subPayloads);
    } else if (item.endsWith(".json")) {
      try {
        const content = fs.readFileSync(fullPath, "utf8");
        const data = JSON.parse(content);

        if (data.encrypted) {
          const decrypted = decryptPayload(content);
          payloads.push(JSON.parse(decrypted));
        } else {
          payloads.push(data);
        }
      } catch {
        // Skip corrupted files
      }
    }
  });

  return payloads;
}

export function deletePayload(id: string, type: string): boolean {
  const filePath = path.join(PAYLOADS_DIR, type, `${id}.json`);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }

  return false;
}

export function updatePayload(id: string, type: string, updates: Partial<StoredPayload>, encrypt: boolean = false): boolean {
  const existing = loadPayload(id, type);

  if (!existing) {
    return false;
  }

  const updated: StoredPayload = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  savePayload(updated, encrypt);
  return true;
}

export function searchPayloads(query: string, type?: string): StoredPayload[] {
  const allPayloads = getAllPayloads(type);
  const lowerQuery = query.toLowerCase();

  return allPayloads.filter(
    (p) =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.description.toLowerCase().includes(lowerQuery) ||
      p.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}

export function getStorageStats(): {
  totalPayloads: number;
  byType: Record<string, number>;
  sizeBytes: number;
} {
  initializeStorage();

  let total = 0;
  let sizeBytes = 0;
  const byType: Record<string, number> = {};

  const walkDir = (dir: string) => {
    const items = fs.readdirSync(dir);

    items.forEach((item) => {
      const fullPath = path.join(dir, item);
      const stats = fs.statSync(fullPath);

      if (stats.isDirectory()) {
        // Count by type
        const type = path.basename(dir) !== "payloads" ? path.basename(dir) : item;
        byType[type] = (byType[type] || 0) + 1;
        walkDir(fullPath);
      } else if (item.endsWith(".json")) {
        total++;
        sizeBytes += stats.size;
      }
    });
  };

  if (fs.existsSync(PAYLOADS_DIR)) {
    walkDir(PAYLOADS_DIR);
  }

  return { totalPayloads: total, byType, sizeBytes };
}
