import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { createActivityLog, getModuleByName, updateModuleStatus } from "../db";
import { getUARTHandler } from "../_core/uart";
import { TRPCError } from "@trpc/server";

export const rfidRouter = router({
  /**
   * Start RFID card scan via ESP32
   */
  startScan: protectedProcedure
    .input(z.object({
      timeout: z.number().default(10000).optional(),
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

        const module = await getModuleByName('rfid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "RFID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'RFID Scan Started',
          status: 'initiated',
          details: { timeout: input.timeout },
        });

        // Send command to ESP32
        const response = await uart.sendCommand('rfid_read', {
          timeout: input.timeout || 10000,
        });

        if (response.error) {
          await updateModuleStatus(module.id, 'error');
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        // Card found
        if (response.result?.found) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'RFID Tag Detected',
            status: 'completed',
            details: {
              uid: response.result.uid,
              type: response.result.type,
              readTime: response.result.read_time,
            },
          });

          return {
            success: true,
            found: true,
            uid: response.result.uid,
            type: response.result.type,
            signalStrength: response.result.rf_field,
          };
        }

        // No card found (timeout)
        await updateModuleStatus(module.id, 'idle');
        return {
          success: true,
          found: false,
          timeout: input.timeout,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[RFID] Scan error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : 'RFID scan failed',
        });
      }
    }),

  /**
   * Stop RFID scan
   */
  stopScan: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const module = await getModuleByName('rfid');
      if (!module) {
        return { success: false };
      }

      await updateModuleStatus(module.id, 'idle');
      await createActivityLog({
        moduleId: module.id,
        userId: ctx.user?.id,
        action: 'RFID Scan Stopped',
        status: 'completed',
        details: {},
      });

      return { success: true };
    } catch (error) {
      console.error('[RFID] Stop scan error:', error);
      return { success: false };
    }
  }),

  /**
   * Dump/read full card data
   */
  dumpTag: protectedProcedure
    .input(z.object({ tagUid: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const uart = getUARTHandler();
        if (!uart.isReady()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ESP32 UART not connected",
          });
        }

        const module = await getModuleByName('rfid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "RFID module not found",
          });
        }

        // Send dump command to ESP32
        const response = await uart.sendCommand('rfid_dump', {
          uid: input.tagUid,
        });

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'Tag Dump Failed',
            status: 'failed',
            details: { tagUid: input.tagUid, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'Tag Dump Completed',
          status: 'completed',
          details: {
            tagUid: input.tagUid,
            sectorsRead: response.result?.sectors_read,
          },
        });

        return {
          success: true,
          uid: input.tagUid,
          data: response.result?.data,
          sectorsRead: response.result?.sectors_read,
          protected: response.result?.protected || false,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[RFID] Dump error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : 'Failed to dump tag',
        });
      }
    }),

  /**
   * Clone tag to blank card
   */
  cloneTag: protectedProcedure
    .input(z.object({
      tagUid: z.string(),
      timeout: z.number().default(15000).optional(),
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

        const module = await getModuleByName('rfid');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "RFID module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'Tag Clone Started',
          status: 'in_progress',
          details: { sourceUid: input.tagUid },
        });

        // Send clone command to ESP32
        const response = await uart.sendCommand('rfid_clone', {
          source_uid: input.tagUid,
          timeout: input.timeout || 15000,
        });

        await updateModuleStatus(module.id, 'idle');

        if (response.error) {
          await createActivityLog({
            moduleId: module.id,
            userId: ctx.user?.id,
            action: 'Tag Clone Failed',
            status: 'failed',
            details: { sourceUid: input.tagUid, error: response.error },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: response.error,
          });
        }

        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'Tag Clone Completed',
          status: 'completed',
          details: {
            sourceUid: input.tagUid,
            clonedUid: response.result?.cloned_uid,
            sectorsWritten: response.result?.sectors_written,
          },
        });

        return {
          success: true,
          sourceUid: input.tagUid,
          clonedUid: response.result?.cloned_uid,
          sectorsWritten: response.result?.sectors_written || 0,
          verified: response.result?.verify_passed || false,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[RFID] Clone error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : 'Failed to clone tag',
        });
      }
    }),

  /**
   * Emulate/replay RFID tag (future enhancement)
   */
  emulateTag: protectedProcedure
    .input(z.object({ tagUid: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const module = await getModuleByName('rfid');
        if (!module) {
          return { success: false };
        }

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'Tag Emulation Started',
          status: 'in_progress',
          details: { tagUid: input.tagUid },
        });

        return { success: true, status: 'emulating' };
      } catch (error) {
        console.error('[RFID] Emulate error:', error);
        return { success: false };
      }
    }),
});

