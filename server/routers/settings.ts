import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { 
  getAllSystemSettings,
  getSystemSetting,
  upsertSystemSetting,
} from "../db";

export const settingsRouter = router({
  /**
   * Get all system settings (public - non-sensitive)
   */
  getAll: publicProcedure.query(async () => {
    try {
      const settings = await getAllSystemSettings();
      return settings.reduce((acc, setting) => {
        acc[setting.key] = {
          value: setting.value,
          description: setting.description,
        };
        return acc;
      }, {} as Record<string, any>);
    } catch (error) {
      console.error('[Settings] Failed to get all settings:', error);
      return {};
    }
  }),

  /**
   * Get specific setting (public - non-sensitive)
   */
  getSetting: publicProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ input }) => {
      try {
        const setting = await getSystemSetting(input.key);
        return setting ? { value: setting.value, description: setting.description } : null;
      } catch (error) {
        console.error('[Settings] Failed to get setting:', error);
        return null;
      }
    }),

  /**
   * Update system setting (protected)
   */
  updateSetting: protectedProcedure
    .input(z.object({
      key: z.string(),
      value: z.any(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        await upsertSystemSetting(input.key, input.value, input.description || undefined);
        return { success: true };
      } catch (error) {
        console.error('[Settings] Failed to update setting:', error);
        return { success: false, error: 'Failed to update setting' };
      }
    }),

  /**
   * Get hardware configuration (protected)
   */
  getHardwareConfig: protectedProcedure.query(async () => {
    try {
      const esp32Config = await getSystemSetting('esp32_config');
      const piConfig = await getSystemSetting('raspberry_pi_config');
      const rfidConfig = await getSystemSetting('rfid_config');

      return {
        esp32: esp32Config?.value || {},
        raspberryPi: piConfig?.value || {},
        rfid: rfidConfig?.value || {},
      };
    } catch (error) {
      console.error('[Settings] Failed to get hardware config:', error);
      return {
        esp32: {},
        raspberryPi: {},
        rfid: {},
      };
    }
  }),

  /**
   * Update hardware configuration (protected)
   */
  updateHardwareConfig: protectedProcedure
    .input(z.object({
      device: z.enum(['esp32', 'raspberryPi', 'rfid']),
      config: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ input }) => {
      try {
        const keyMap = {
          esp32: 'esp32_config',
          raspberryPi: 'raspberry_pi_config',
          rfid: 'rfid_config',
        };

        await upsertSystemSetting(keyMap[input.device], input.config, undefined);
        return { success: true };
      } catch (error) {
        console.error('[Settings] Failed to update hardware config:', error);
        return { success: false, error: 'Failed to update hardware configuration' };
      }
    }),

  /**
   * Get network settings
   */
  getNetworkSettings: publicProcedure.query(async () => {
    try {
      const wifiSettings = await getSystemSetting('wifi_settings');
      const lanSettings = await getSystemSetting('lan_settings');

      return {
        wifi: wifiSettings?.value || {},
        lan: lanSettings?.value || {},
      };
    } catch (error) {
      console.error('[Settings] Failed to get network settings:', error);
      return {
        wifi: {},
        lan: {},
      };
    }
  }),

  /**
   * Update network settings
   */
  updateNetworkSettings: publicProcedure
    .input(z.object({
      type: z.enum(['wifi', 'lan']),
      settings: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ input }) => {
      try {
        const key = input.type === 'wifi' ? 'wifi_settings' : 'lan_settings';
        await upsertSystemSetting(key, input.settings, undefined);
        return { success: true };
      } catch (error) {
        console.error('[Settings] Failed to update network settings:', error);
        return { success: false, error: 'Failed to update network settings' };
      }
    }),

  /**
   * Reset to defaults
   */
  resetToDefaults: publicProcedure.mutation(async () => {
    try {
      // Default settings
      const defaults = {
        esp32_config: { enabled: true, baudRate: 115200 },
        raspberry_pi_config: { enabled: true, sshPort: 22 },
        rfid_config: { enabled: true, protocol: 'ISO14443A' },
        wifi_settings: { channel: 6, txPower: 20 },
        lan_settings: { scanTimeout: 5000, threadCount: 10 },
      };

      for (const [key, value] of Object.entries(defaults)) {
        await upsertSystemSetting(key, value, undefined);
      }

      return { success: true };
    } catch (error) {
      console.error('[Settings] Failed to reset settings:', error);
      return { success: false, error: 'Failed to reset settings' };
    }
  }),
});
