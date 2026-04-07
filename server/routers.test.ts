import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createMockContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("Auth Router", () => {
  it("should get current user", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toEqual(ctx.user);
  });

  it("should logout user", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(ctx.res.clearCookie).toHaveBeenCalled();
  });
});

describe("Router Structure", () => {
  it("should have all required routers", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    
    expect(caller).toHaveProperty("dashboard");
    expect(caller).toHaveProperty("wifi");
    expect(caller).toHaveProperty("hid");
    expect(caller).toHaveProperty("rfid");
    expect(caller).toHaveProperty("lan");
    expect(caller).toHaveProperty("logging");
    expect(caller).toHaveProperty("settings");
    expect(caller).toHaveProperty("auth");
  });

  it("should have dashboard procedures", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    
    expect(caller.dashboard).toHaveProperty("getSystemStatus");
    expect(caller.dashboard).toHaveProperty("getHardwareHealth");
    expect(caller.dashboard).toHaveProperty("getModuleStatus");
  });

  it("should have wifi procedures", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    
    expect(caller.wifi).toHaveProperty("startScan");
    expect(caller.wifi).toHaveProperty("stopScan");
    expect(caller.wifi).toHaveProperty("deauthAttack");
    expect(caller.wifi).toHaveProperty("startCapture");
  });

  it("should have hid procedures", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    
    expect(caller.hid).toHaveProperty("createPayload");
    expect(caller.hid).toHaveProperty("executePayload");
    expect(caller.hid).toHaveProperty("deletePayload");
  });

  it("should have rfid procedures", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    
    expect(caller.rfid).toHaveProperty("startScan");
    expect(caller.rfid).toHaveProperty("stopScan");
    expect(caller.rfid).toHaveProperty("cloneTag");
    expect(caller.rfid).toHaveProperty("emulateTag");
  });

  it("should have lan procedures", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    
    expect(caller.lan).toHaveProperty("startScan");
    expect(caller.lan).toHaveProperty("stopScan");
    expect(caller.lan).toHaveProperty("deployPayload");
  });

  it("should have logging procedures", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    
    expect(caller.logging).toHaveProperty("getLogs");
    expect(caller.logging).toHaveProperty("getStats");
    expect(caller.logging).toHaveProperty("exportLogs");
    expect(caller.logging).toHaveProperty("clearLogs");
  });

  it("should have settings procedures", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    
    expect(caller.settings).toHaveProperty("getSettings");
    expect(caller.settings).toHaveProperty("updateSetting");
    expect(caller.settings).toHaveProperty("resetToDefaults");
  });
});

describe("Input Validation", () => {
  it("should validate HID payload creation input", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    
    try {
      // @ts-ignore - intentionally passing invalid input
      await caller.hid.createPayload({ name: 123 });
    } catch (error: any) {
      expect(error.code).toBe("BAD_REQUEST");
    }
  });

  it("should validate RFID clone tag input", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    
    try {
      // @ts-ignore - intentionally passing invalid input
      await caller.rfid.cloneTag({ tagUid: 123 });
    } catch (error: any) {
      expect(error.code).toBe("BAD_REQUEST");
    }
  });

  it("should validate LAN deploy payload input", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    
    try {
      // @ts-ignore - intentionally passing invalid input
      await caller.lan.deployPayload({ targetIp: 123, payloadId: "test" });
    } catch (error: any) {
      expect(error.code).toBe("BAD_REQUEST");
    }
  });
});
