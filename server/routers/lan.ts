import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { createActivityLog, getModuleByName, updateModuleStatus } from "../db";
import { spawn } from "child_process";
import { TRPCError } from "@trpc/server";

export const lanRouter = router({
  /**
   * Start network device discovery using arp-scan
   */
  startScan: protectedProcedure
    .input(z.object({
      interface: z.string().default('wlan0'),
      timeout: z.number().default(5).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const module = await getModuleByName('lan');
        const module = await getModuleByName('lan');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "LAN module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'LAN Scan Started',
          status: 'initiated',
          details: { interface: input.interface },
        });

        // Non-blocking scan
        performArpScan(input.interface, input.timeout || 5)
          .catch(err => {
            console.error('[LAN] ARP scan error:', err);
          });

        return { success: true, status: 'scanning' };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[LAN] Start scan error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to start LAN scan",
        });
      }
    }),

  /**
   * Stop LAN scan
   */
  stopScan: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const module = await getModuleByName('lan');
      if (!module) return { success: false };

      await updateModuleStatus(module.id, 'idle');
      await createActivityLog({
        moduleId: module.id,
        userId: ctx.user?.id,
        action: 'LAN Scan Stopped',
        status: 'completed',
        details: {},
      });

      return { success: true };
    } catch (error) {
      console.error('[LAN] Stop scan error:', error);
      return { success: false };
    }
  }),

  /**
   * Get discovered LAN devices
   */
  getDiscoveredDevices: protectedProcedure
    .input(z.object({ limit: z.number().default(100) }).optional())
    .query(async () => {
      try {
        // TODO: Query from database of discovered devices
        // For now, return empty array - scan populates DB
        return [];
      } catch (error) {
        console.error('[LAN] Get devices error:', error);
        return [];
      }
    }),

  /**
   * Deploy payload to target LAN device
   */
  deployPayload: protectedProcedure
    .input(z.object({
      targetIp: z.string().ip(),
      payloadId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const module = await getModuleByName('lan');
        if (!module) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "LAN module not found",
          });
        }

        await updateModuleStatus(module.id, 'running');
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'Payload Deploy Started',
          status: 'in_progress',
          details: { targetIp: input.targetIp, payloadId: input.payloadId },
        });

        // TODO: Implement actual payload deployment
        // This would depend on the target OS and available exploits

        await updateModuleStatus(module.id, 'idle');

        return {
          success: true,
          targetIp: input.targetIp,
          status: 'deployed',
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[LAN] Deploy error:', error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to deploy payload",
        });
      }
    }),

  /**
   * Probe specific IP address
   */
  probeIp: protectedProcedure
    .input(z.object({
      ipAddress: z.string().ip(),
    }))
    .query(async ({ input }) => {
      try {
        return new Promise((resolve) => {
          // Simple ping probe
          const ping = spawn('ping', ['-c', '1', '-W', '2', input.ipAddress]);
          let isOnline = false;

          ping.on('close', (code) => {
            isOnline = code === 0;
            resolve({
              ip: input.ipAddress,
              online: isOnline,
              probeTime: new Date().toISOString(),
            });
          });
        });
      } catch (error) {
        console.error('[LAN] Probe error:', error);
        return {
          ip: input.ipAddress,
          online: false,
          error: 'Probe failed',
        };
      }
    }),

  /**
   * Perform ARP scan and return list of devices on the local network
   */
  scan: router.get('/scan', async (req, res) => {
    exec('arp-scan --localnet', (error, stdout, stderr) => {
      if (error) {
        res.status(500).json({ error: stderr });
        return;
      }

      const devices = stdout.split('\n').slice(2, -4).map((line) => {
        const [ip, mac, vendor] = line.split('\t');
        return { ip, mac, vendor };
      });

      res.json({ devices });
    });
  }),
});

/**
 * Perform ARP scan using arp-scan tool
 * Discovers online devices on the local network
 */
async function performArpScan(
  iface: string = 'wlan0',
  timeout: number = 5
): Promise<void> {
  return new Promise((resolve, reject) => {
    // arp-scan --interface=wlan0 --timeout=5000 --localnet
    const scan = spawn('sudo', [
      'arp-scan',
      `--interface=${iface}`,
      `--timeout=${timeout * 1000}`,
      '--localnet',
    ], {
      timeout: (timeout + 10) * 1000,
    });

    let output = '';
    let errors = '';

    scan.stdout.on('data', (data) => {
      output += data.toString();
    });

    scan.stderr.on('data', (data) => {
      errors += data.toString();
    });

    scan.on('close', async (code) => {
      if (code === 0 || code === 1) {
        try {
          // Parse arp-scan output
          const devices = parseArpScanOutput(output);
          console.log(`[LAN] Found ${devices.length} devices`);

          // TODO: Store devices in database
          // for (const device of devices) {
          //   await upsertLanDevice(device);
          // }

          // Update module status
          await resolveLanScan();

          resolve();
        } catch (err) {
          console.error('[LAN] Parse error:', err);
          reject(err);
        }
      } else {
        console.error('[LAN] Scan failed:', errors);
        reject(new Error(`ARP scan failed with code ${code}`));
      }
    });
  });
}

function parseArpScanOutput(output: string): any[] {
  const devices = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // Parse lines like: 192.168.1.100	aa:bb:cc:dd:ee:ff	Some Device Name
    const match = line.match(/^(\d+\.\d+\.\d+\.\d+)\s+([a-f0-9:]{17})\s+(.+)$/i);
    if (match) {
      devices.push({
        ipAddress: match[1],
        macAddress: match[2].toUpperCase(),
        hostname: match[3].trim(),
        discoveredAt: new Date(),
      });
    }
  }

  return devices;
}

async function resolveLanScan(): Promise<void> {
  const module = await getModuleByName('lan');
  if (module) {
    await updateModuleStatus(module.id, 'idle');
    await createActivityLog({
      moduleId: module.id,
      action: 'LAN Scan Completed',
      status: 'completed',
      details: {},
    });
  }
}

