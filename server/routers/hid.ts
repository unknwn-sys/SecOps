import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { createActivityLog, getModuleByName, updateModuleStatus } from "../db";
import { getUARTHandler } from "../_core/uart";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import * as fs from "fs";
import * as path from "path";
import serial from '../hardware/serial';

const PAYLOADS_DIR = path.join(process.cwd(), "data", "payloads", "hid");

// Ensure payloads directory exists
if (!fs.existsSync(PAYLOADS_DIR)) {
  fs.mkdirSync(PAYLOADS_DIR, { recursive: true });
}

export const hidRouter = router({
  /**
   * List HID payloads
   */
  listPayloads: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(async ({ ctx }) => {
      try {
        const module = await getModuleByName('hid');
        if (!module) return [];

        // List JSON payload files
        const files = fs.readdirSync(PAYLOADS_DIR).filter(f => f.endsWith('.json'));
        
        return files.slice(0, 50).map(file => {
          const fileData = JSON.parse(
            fs.readFileSync(path.join(PAYLOADS_DIR, file), 'utf-8')
          );
          return {
            id: file.replace('.json', ''),
            name: fileData.name,
            description: fileData.description,
            createdAt: fileData.createdAt,
            payload: fileData.payload.substring(0, 50) + '...',
            delayMs: fileData.delayMs,
          };
        });
      } catch (error) {
        console.error('[HID] Failed to list payloads:', error);
        return [];
      }
    }),

  /**
   * Create new HID payload
   */
  createPayload: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(128),
      description: z.string().optional(),
      payload: z.string().min(1).max(5000),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        const payloadId = nanoid();
        const payloadData = {
          id: payloadId,
          name: input.name,
          description: input.description || '',
          payload: input.payload,
          delayMs: input.delayMs,
          createdAt: new Date().toISOString(),
          createdBy: ctx.user?.id || 0,
        };

        // Store payload to disk
        fs.writeFileSync(
          path.join(PAYLOADS_DIR, `${payloadId}.json`),
          JSON.stringify(payloadData, null, 2)
        );

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Payload Created',
          status: 'completed',
          details: { name: input.name, payloadId, length: input.payload.length },
        });

        return { success: true, payloadId };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Failed to create payload:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to create payload",
        });
      }
    }),

  /**
   * Get payload details
   */
  getPayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .query(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          return null;
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));
        return {
          id: input.payloadId,
          name: payloadData.name,
          description: payloadData.description,
          payload: payloadData.payload,
          delayMs: payloadData.delayMs,
          createdAt: payloadData.createdAt,
        };
      } catch (error) {
        console.error('[HID] Failed to get payload:', error);
        return null;
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
     
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send keys",
        });
      }
    }),

  /**
   * Update payload
   */
  updatePayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      payload: z.string().optional(),
      delayMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        // Update fields
        if (input.name) payloadData.name = input.name;
        if (input.description) payloadData.description = input.description;
        if (input.payload) payloadData.payload = input.payload;
        if (input.delayMs !== undefined) payloadData.delayMs = input.delayMs;

        fs.writeFileSync(payloadPath, JSON.stringify(payloadData, null, 2));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update payload",
        });
      }
    }),

  /**
   * Delete payload
   */
  deletePayload: protectedProcedure
    .input(z.object({ payloadId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        fs.unlinkSync(payloadPath);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete payload",
        });
      }
    }),

  /**
   * Inject HID payload via ESP32
   */
  injectPayload: protectedProcedure
    .input(z.object({
      payloadId: z.string(),
      delayMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        // Load payload
        const payloadPath = path.join(PAYLOADS_DIR, `${input.payloadId}.json`);
        if (!fs.existsSync(payloadPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payload not found",
          });
        }

        const payloadData = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Started',
          status: 'in_progress',
          details: { payloadId: input.payloadId, delay: input.delayMs },
        });

        // Send injection command to ESP32
        const response = await uart.sendCommand('hid_inject', {
          payload: payloadData.payload,
          delayMs: input.delayMs,
          keyRate: payloadData.delayMs || 100,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'HID Injection Failed',
            status: 'failed',
            details: { payloadId: input.payloadId, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'HID Injection Completed',
          status: 'completed',
          details: {
            payloadId: input.payloadId,
            keysSent: response.result?.keys_sent || response.result?.key_count,
            duration: response.result?.actual_duration,
          },
        });

        return {
          success: true,
          status: response.result?.status || 'complete',
          keysSent: response.result?.keys_sent || response.result?.key_count,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Injection error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "HID injection failed",
        });
      }
    }),

  /**
   * Send raw keycodes via ESP32
   */
  sendKeys: protectedProcedure
    .input(z.object({
      keys: z.array(z.object({
        key: z.number(),
        modifier: z.number().default(0),
      })),
      keyRate: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('hid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "HID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');

        // Send key command to ESP32
        const response = await uart.sendCommand('hid_keysend', {
          keys: input.keys,
          keyRate: input.keyRate,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        return {
          success: true,
          keysSent: response.result?.keys_sent,
          duration: response.result?.actual_duration,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[HID] Keys error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ?