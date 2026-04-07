import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { dashboardRouter } from "./routers/dashboard";
import { wifiRouter } from "./routers/wifi";
import { hidRouter } from "./routers/hid";
import { rfidRouter } from "./routers/rfid";
import { lanRouter } from "./routers/lan";
import { loggingRouter } from "./routers/logging";
import { settingsRouter } from "./routers/settings";
import { payloadRouter } from "./routers/payload";
import { z } from "zod";
import { createJWT } from "./_core/auth";
import * as db from "./db";
import { TRPCError } from "@trpc/server";

// Simple password comparison
async function comparePassword(plainText: string, hash: string): Promise<boolean> {
  try {
    const bcrypt = await import("bcryptjs").catch(() => null);
    if (bcrypt) {
      return bcrypt.compare(plainText, hash);
    }
  } catch (e) {
    // bcryptjs not available
  }
  
  const crypto = await import("crypto");
  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(plainText.padEnd(hash.length, '\0'))
  );
}

export const appRouter = router({
  system: systemRouter,
  dashboard: dashboardRouter,
  wifi: wifiRouter,
  hid: hidRouter,
  rfid: rfidRouter,
  lan: lanRouter,
  logging: loggingRouter,
  settings: settingsRouter,
  payload: payloadRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    
    login: publicProcedure
      .input(
        z.object({
          username: z.string().min(1, "username is required"),
          password: z.string().min(1, "password is required"),
        })
      )
      .mutation(async ({ input }) => {
        try {
          const user = await db.getUserByUsername(input.username);
          
          if (!user || !user.passwordHash) {
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "Invalid credentials",
            });
          }

          const isValid = await comparePassword(input.password, user.passwordHash);
          
          if (!isValid) {
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "Invalid credentials",
            });
          }

          const token = await createJWT(user);
          await db.updateUserLastSignedIn(user.id);

          return {
            success: true,
            token,
            user: {
              id: user.id,
              username: user.username,
              name: user.name,
              role: user.role,
            },
          };
        } catch (error) {
          if (error instanceof TRPCError) {
            throw error;
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Login failed",
          });
        }
      }),
    
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
});

export type AppRouter = typeof appRouter;
