import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { 
  getActivityLogs,
  getAllModules,
} from "../db";
import fs from 'fs';
import path from 'path';

const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

export const loggingRouter = router({
  /**
   * Get activity logs with filtering (protected)
   */
  getLogs: protectedProcedure
    .input(z.object({
      moduleId: z.number().optional(),
      status: z.enum(['initiated', 'in_progress', 'completed', 'failed']).optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      try {
        const logs = await getActivityLogs({
          moduleId: input.moduleId,
          status: input.status,
          limit: input.limit,
          offset: input.offset,
        });

        return (logs as any[]).map(log => ({
          id: log.id,
          moduleId: log.moduleId,
          userId: log.userId,
          action: log.action,
          status: log.status,
          details: log.details,
          output: log.output,
          startedAt: log.startedAt,
          completedAt: log.completedAt,
          duration: log.duration,
        }));
      } catch (error) {
        console.error('[Logging] Failed to get logs:', error);
        return [];
      }
    }),

  /**
   * Get log statistics (protected)
   */
  getStats: protectedProcedure.query(async () => {
    try {
      const allLogs = await getActivityLogs({ limit: 1000 });
      const logs = allLogs as any[];

      const stats = {
        total: logs.length,
        completed: logs.filter(l => l.status === 'completed').length,
        failed: logs.filter(l => l.status === 'failed').length,
        inProgress: logs.filter(l => l.status === 'in_progress').length,
        initiated: logs.filter(l => l.status === 'initiated').length,
        byModule: {} as Record<number, number>,
      };

      logs.forEach(log => {
        stats.byModule[log.moduleId] = (stats.byModule[log.moduleId] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error('[Logging] Failed to get stats:', error);
      return {
        total: 0,
        completed: 0,
        failed: 0,
        inProgress: 0,
        initiated: 0,
        byModule: {},
      };
    }
  }),

  /**
   * Export logs as JSON
   */
  exportLogs: publicProcedure
    .input(z.object({
      format: z.enum(['json', 'csv']).default('json'),
      moduleId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      try {
        const logs = await getActivityLogs({ moduleId: input.moduleId, limit: 10000 });
        const modules = await getAllModules();
        const moduleMap = modules.reduce((acc, m) => {
          acc[m.id] = m.name;
          return acc;
        }, {} as Record<number, string>);

        if (input.format === 'json') {
          return {
            format: 'json',
            data: (logs as any[]).map(log => ({
              id: log.id,
              module: moduleMap[log.moduleId] || 'Unknown',
              action: log.action,
              status: log.status,
              startedAt: log.startedAt?.toISOString(),
              completedAt: log.completedAt?.toISOString(),
              duration: log.duration,
            })),
          };
        } else {
          // CSV format
          const headers = ['ID', 'Module', 'Action', 'Status', 'Started', 'Completed', 'Duration (ms)'];
          const rows = (logs as any[]).map(log => [
            log.id,
            moduleMap[log.moduleId] || 'Unknown',
            log.action,
            log.status,
            log.startedAt?.toISOString() || '',
            log.completedAt?.toISOString() || '',
            log.duration || '',
          ]);

          return {
            format: 'csv',
            data: [headers, ...rows],
          };
        }
      } catch (error) {
        console.error('[Logging] Failed to export logs:', error);
        return { format: input.format, data: [] };
      }
    }),

  /**
   * Clear logs (admin only)
   */
  clearLogs: publicProcedure.mutation(async ({ ctx }) => {
    // In a real implementation, this would check for admin role
    // For now, we'll just return a success message
    // TODO: Implement actual log clearing logic
    return { success: true, message: 'Logs would be cleared here' };
  }),

  /**
   * Log data into daily JSON files
   */
  logData: publicProcedure
    .input(z.object({
      data: z.any(),
    }))
    .post(async ({ input }) => {
      const logFile = path.join(logDir, `${new Date().toISOString().split('T')[0]}.json`);

      fs.appendFile(logFile, JSON.stringify(input.data) + '\n', (err) => {
        if (err) {
          console.error('[Logging] Failed to write log:', err);
          return;
        }

        console.log(`[Logging] Data written to ${logFile}`);
      });
    }),

  /**
   * Log data into daily JSON files (route)
   */
  logDataRoute: publicProcedure
    .input(z.object({
      data: z.any(),
    }))
    .post(async ({ input }) => {
      const logFile = path.join(logDir, `${new Date().toISOString().split('T')[0]}.json`);

      fs.appendFile(logFile, JSON.stringify(input.data) + '\n', (err) => {
        if (err) {
          console.error('[Logging] Failed to write log:', err);
          return;
        }

        console.log(`[Logging] Data written to ${logFile}`);
      });
    }),
});