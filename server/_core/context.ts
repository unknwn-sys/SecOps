import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { verifyJWT, extractTokenFromHeader } from "./auth";
import * as db from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    // Try to extract JWT from Authorization header
    const authHeader = opts.req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (token) {
      const payload = await verifyJWT(token);
      const dbUser = await db.getUserById(payload.userId);
      if (dbUser) {
        user = dbUser;
      }
    }
  } catch (error) {
    // Authentication is optional for public procedures
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
