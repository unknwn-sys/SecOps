import { router, publicProcedure } from "../_core/trpc";
import { 
  getAllModules, 
  getHardwareStatus, 
  getAllSystemSettings,
  getActivityLogs 
} from "../db";

export const dashboardRouter = router({
  /**
   * Get system overview status
   */
  getSystemStatus: publicProcedure.query(async () => {
    try {
      const modules = await getAllModules();
      const hardwareStatus = await getHardwareStatus();
      const recentLogs = await getActivityLogs({ limit: 5 });

      const activeModules = modules.filter(m => m.status === 'running').length;
      const onlineDevices = hardwareStatus.filter(h => h.status === 'online').length;

      return {
        systemStatus: onlineDevices === hardwareStatus.length ? 'online' : 'degraded',
        activeModules,
        connectedDevices: onlineDevices,
        totalModules: modules.length,
        totalDevices: hardwareStatus.length,
        uptime: Math.floor(Date.now() / 1000), // Will be calculated on client
      };
    } catch (error) {
      console.error('[Dashboard] Failed to get system status:', error);
      return {
        systemStatus: 'error',
        activeModules: 0,
        connectedDevices: 0,
        totalModules: 0,
        totalDevices: 0,
        uptime: 0,
      };
    }
  }),

  /**
   * Get hardware health for all devices
   */
  getHardwareHealth: publicProcedure.query(async () => {
    try {
      const hardware = await getHardwareStatus();
      
      return hardware.map(device => ({
        id: device.id,
        deviceType: device.deviceType,
        status: device.status,
        cpuUsage: parseFloat(device.cpuUsage?.toString() || '0'),
        memoryUsage: parseFloat(device.memoryUsage?.toString() || '0'),
        temperature: parseFloat(device.temperature?.toString() || '0'),
        lastHeartbeat: device.lastHeartbeat,
        metadata: device.metadata,
      }));
    } catch (error) {
      console.error('[Dashboard] Failed to get hardware health:', error);
      return [];
    }
  }),

  /**
   * Get module status overview
   */
  getModuleStatus: publicProcedure.query(async () => {
    try {
      const modules = await getAllModules();
      
      return modules.map(module => ({
        id: module.id,
        name: module.name,
        type: module.type,
        status: module.status,
        enabled: module.enabled,
        lastExecuted: module.lastExecuted,
      }));
    } catch (error) {
      console.error('[Dashboard] Failed to get module status:', error);
      return [];
    }
  }),

  /**
   * Get recent activity logs
   */
  getRecentActivity: publicProcedure.query(async () => {
    try {
      const logs = await getActivityLogs({ limit: 10 });
      
      return logs.map((log: any) => ({
        id: log.id,
        moduleId: log.moduleId,
        action: log.action,
        status: log.status,
        startedAt: log.startedAt,
        completedAt: log.completedAt,
        duration: log.duration,
      }));
    } catch (error) {
      console.error('[Dashboard] Failed to get recent activity:', error);
      return [];
    }
  }),

  /**
   * Get system settings
   */
  getSystemSettings: publicProcedure.query(async () => {
    try {
      const settings = await getAllSystemSettings();
      
      return settings.reduce((acc, setting) => {
        acc[setting.key] = setting.value;
        return acc;
      }, {} as Record<string, any>);
    } catch (error) {
      console.error('[Dashboard] Failed to get system settings:', error);
      return {};
    }
  }),
});
