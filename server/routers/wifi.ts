import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { 
  getAllWiFiNetworks, 
  upsertWiFiNetwork,
  createActivityLog,
  updateModuleStatus,
  getModuleByName
} from "../db";
import { spawn } from "child_process";
import * as path from "path";

export const wifiRouter = router({
  /**
   * Get all discovered WiFi networks (public query)
   */
  getNetworks: publicProcedure.query(async () => {
    try {
      const networks = await getAllWiFiNetworks();
      return networks.map(net => ({
        id: net.id,
        ssid: net.ssid,
        bssid: net.bssid,
        channel: net.channel,
        signalStrength: net.signalStrength,
        encryption: net.encryption,
        lastDiscovered: net.lastDiscovered,
      }));
    } catch (error) {
      console.error('[WiFi] Failed to get networks:', error);
      return [];
    }
  }),

  /**
   * Start WiFi network scan (protected) - Uses external adapter (wlan1)
   */
  startScan: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const module = await getModuleByName('wifi');
      if (!module) {
        return { success: false, error: 'WiFi module not found' };
      }

      await updateModuleStatus(module.id, 'running');
      await createActivityLog({
        moduleId: module.id,
        userId: ctx.user?.id,
        action: 'WiFi Scan Started',
        status: 'initiated',
        details: { type: 'network_scan', adapter: 'wlan1' },
      });

      // Non-blocking scan on external adapter (wlan1)
      scanNetworks().catch(err => {
        console.error('[WiFi] Scan error:', err);
      });

      return { success: true, moduleId: module.id, status: 'scanning' };
    } catch (error) {
      console.error('[WiFi] Failed to start scan:', error);
      return { success: false, error: 'Failed to start scan' };
    }
  }),

  /**
   * Get scan status
   */
  getScanStatus: publicProcedure.query(async () => {
    try {
      const module = await getModuleByName('wifi');
      if (!module) return { status: 'unknown' };
      return { status: module.status, lastExecuted: module.lastExecuted };
    } catch (error) {
      return { status: 'error' };
    }
  }),

  /**
   * Stop WiFi scan
   */
  stopScan: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const module = await getModuleByName('wifi');
      if (!module) return { success: false };
      
      await updateModuleStatus(module.id, 'idle');
      await createActivityLog({
        moduleId: module.id,
        userId: ctx.user?.id,
        action: 'WiFi Scan Stopped',
        status: 'completed',
        details: { type: 'scan_stop' },
      });
      
      return { success: true };
    } catch (error) {
      console.error('[WiFi] Failed to stop scan:', error);
      return { success: false };
    }
  }),
});

/**
 * Perform WiFi network scan using iwlist on external adapter
 * Scans wlan1 (external USB adapter) to avoid disrupting control network (wlan0)
 */
async function scanNetworks(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Use non-blocking spawn to scan networks
    const scan = spawn('sudo', ['iwlist', 'wlan1', 'scan'], {
      timeout: 30000,
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
      if (code !== 0) {
        console.error('[WiFi] Scan failed:', errors);
        reject(new Error(`Scan failed with code ${code}`));
        return;
      }

      try {
        // Parse iwlist output
        const networks = parseIwlistOutput(output);
        
        // Store networks in database
        for (const network of networks) {
          await upsertWiFiNetwork({
            ssid: network.ssid,
            bssid: network.bssid,
            channel: network.channel,
            signalStrength: network.signalStrength,
            encryption: network.encryption,
          });
        }

        // Update module status
        const module = await getModuleByName('wifi');
        if (module) {
          await updateModuleStatus(module.id, 'idle');
          await createActivityLog({
            moduleId: module.id,
            action: 'WiFi Scan Completed',
            status: 'completed',
            details: { networksFound: networks.length },
          });
        }

        console.log(`[WiFi] Found ${networks.length} networks`);
        resolve();
      } catch (err) {
        console.error('[WiFi] Parse error:', err);
        reject(err);
      }
    });
  });
}

/**
 * Parse iwlist output to extract network information
 */
function parseIwlistOutput(output: string): any[] {
  const networks = [];
  const cells = output.split('Cell');

  for (const cell of cells.slice(1)) {
    const network: any = {};

    // Extract BSSID
    const bssidMatch = cell.match(/Address: ([0-9A-F:]{17})/i);
    if (bssidMatch) {
      network.bssid = bssidMatch[1].toUpperCase();
    }

    // Extract SSID
    const ssidMatch = cell.match(/ESSID:"([^"]*)"/);
    if (ssidMatch) {
      network.ssid = ssidMatch[1] || '(hidden)';
    } else {
      network.ssid = '(hidden)';
    }

    // Extract signal strength
    const signalMatch = cell.match(/Signal level[=:]\s*(-?\d+)/i);
    if (signalMatch) {
      network.signalStrength = parseInt(signalMatch[1]);
    }

    // Extract channel
    const channelMatch = cell.match(/Channel[=:]\s*(\d+)/i);
    if (channelMatch) {
      network.channel = parseInt(channelMatch[1]);
    }

    // Extract encryption
    const encryptionMatch = cell.match(/Encryption key[=:]([^\n]*)/i);
    if (encryptionMatch) {
      network.encryption = encryptionMatch[1].includes('off') ? 'Open' : 'WPA/WPA2/WEP';
    } else {
      network.encryption = 'Unknown';
    }

    if (network.bssid) {
      networks.push(network);
    }
  }

  return networks;
}


  /**
   * Stop WiFi network scan (protected)
   */
  stopScan: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const module = await getModuleByName('wifi');
      if (!module) {
        return { success: false, error: 'WiFi module not found' };
      }

      await updateModuleStatus(module.id, 'idle');

      return { success: true };
    } catch (error) {
      console.error('[WiFi] Failed to stop scan:', error);
      return { success: false, error: 'Failed to stop scan' };
    }
  }),

  /**
   * Add discovered WiFi network (protected)
   */
  addNetwork: protectedProcedure
    .input(z.object({
      ssid: z.string(),
      bssid: z.string(),
      channel: z.number().optional(),
      signalStrength: z.number().optional(),
      encryption: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        await upsertWiFiNetwork({
          ssid: input.ssid,
          bssid: input.bssid,
          channel: input.channel,
          signalStrength: input.signalStrength,
          encryption: input.encryption,
        });

        return { success: true };
      } catch (error) {
        console.error('[WiFi] Failed to add network:', error);
        return { success: false, error: 'Failed to add network' };
      }
    }),

  /**
   * Start deauthentication attack
   */
  startDeauth: publicProcedure
    .input(z.object({
      targetBSSID: z.string(),
      targetSSID: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const module = await getModuleByName('wifi');
        if (!module) {
          return { success: false, error: 'WiFi module not found' };
        }

        await updateModuleStatus(module.id, 'running');

        // Create activity log
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'Deauth Attack Started',
          status: 'initiated',
          details: { 
            type: 'deauth_attack',
            targetBSSID: input.targetBSSID,
            targetSSID: input.targetSSID,
          },
        });

        return { success: true, moduleId: module.id };
      } catch (error) {
        console.error('[WiFi] Failed to start deauth:', error);
        return { success: false, error: 'Failed to start deauth attack' };
      }
    }),

  /**
   * Stop deauthentication attack
   */
  stopDeauth: publicProcedure.mutation(async ({ ctx }) => {
    try {
      const module = await getModuleByName('wifi');
      if (!module) {
        return { success: false, error: 'WiFi module not found' };
      }

      await updateModuleStatus(module.id, 'idle');

      return { success: true };
    } catch (error) {
      console.error('[WiFi] Failed to stop deauth:', error);
      return { success: false, error: 'Failed to stop deauth attack' };
    }
  }),

  /**
   * Start packet capture
   */
  startCapture: publicProcedure
    .input(z.object({
      channel: z.number().optional(),
      interface: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const module = await getModuleByName('wifi');
        if (!module) {
          return { success: false, error: 'WiFi module not found' };
        }

        await updateModuleStatus(module.id, 'running');

        // Create activity log
        await createActivityLog({
          moduleId: module.id,
          userId: ctx.user?.id,
          action: 'Packet Capture Started',
          status: 'initiated',
          details: { 
            type: 'packet_capture',
            channel: input.channel,
            interface: input.interface,
          },
        });

        return { success: true, moduleId: module.id };
      } catch (error) {
        console.error('[WiFi] Failed to start capture:', error);
        return { success: false, error: 'Failed to start packet capture' };
      }
    }),

  /**
   * Stop packet capture
   */
  stopCapture: publicProcedure.mutation(async ({ ctx }) => {
    try {
      const module = await getModuleByName('wifi');
      if (!module) {
        return { success: false, error: 'WiFi module not found' };
      }

      await updateModuleStatus(module.id, 'idle');

      return { success: true };
    } catch (error) {
      console.error('[WiFi] Failed to stop capture:', error);
      return { success: false, error: 'Failed to stop packet capture' };
    }
  }),
});
