import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),

  // Check which modules are available
  getModuleStatus: publicProcedure.query(() => {
    // Check if hardware is actually connected
    // On development machines: all false
    // On Raspberry Pi with connections: detects actual hardware
    const isProduction = process.env.NODE_ENV === "production";
    const hasHID = isProduction ? checkSerialConnection() : false;
    const hasRFID = isProduction ? checkRFIDReader() : false;
    const hasWiFi = isProduction ? checkWiFiAdapter() : false;
    const hasLAN = true; // Network is always available if system is running

    return {
      hid: hasHID,
      rfid: hasRFID,
      wifi: hasWiFi,
      lan: hasLAN,
      generic: true, // Generic always available
      timestamp: new Date().toISOString(),
    };
  }),
});

// Helper functions to detect hardware
function checkSerialConnection(): boolean {
  // TODO: Implement actual serial port detection
  // Check for /dev/ttyUSB* or /dev/ttyACM* on Linux
  // This would require importing 'fs' module and checking device files
  try {
    if (typeof require !== "undefined") {
      const fs = require("fs") as any;
      const ports = fs.readdirSync("/dev").filter((p: string) => p.startsWith("ttyUSB") || p.startsWith("ttyACM"));
      return ports.length > 0;
    }
  } catch {
    return false;
  }
  return false;
}

function checkRFIDReader(): boolean {
  // TODO: Implement actual RFID reader detection
  // Check for USB device with RFID reader VID/PID
  try {
    if (typeof require !== "undefined") {
      const fs = require("fs") as any;
      // Check for RFID reader in /sys/bus/usb/devices
      return fs.existsSync("/sys/bus/usb/devices");
    }
  } catch {
    return false;
  }
  return false;
}

function checkWiFiAdapter(): boolean {
  // TODO: Implement WiFi adapter detection
  // Check for WiFi interfaces like wlan0, wlan1, etc.
  try {
    if (typeof require !== "undefined") {
      const fs = require("fs") as any;
      const interfaces = fs.readdirSync("/sys/class/net");
      return interfaces.some((iface: string) => iface.startsWith("wlan") || iface.startsWith("mon"));
    }
  } catch {
    return false;
  }
  return false;
}
